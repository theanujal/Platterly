import { describe, expect, it } from "vitest";
import { checkDownSql, createdFunctions, createdTables, foreignKeyEdges } from "../down-sql";

const UP = `
CREATE TABLE "parents" ("id" UUID NOT NULL, CONSTRAINT "parents_pkey" PRIMARY KEY ("id"));
CREATE TABLE "children" ("id" UUID NOT NULL, "parent_id" UUID NOT NULL, CONSTRAINT "children_pkey" PRIMARY KEY ("id"));
ALTER TABLE "children" ADD CONSTRAINT "children_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
`;

const problemsOf = (down: string) => {
  const result = checkDownSql(down, UP);
  return result.ok ? [] : result.problems;
};

describe("rollback static check", () => {
  it("reads the tables and foreign keys of the forward migration", () => {
    expect(createdTables(UP)).toEqual(["parents", "children"]);
    expect(foreignKeyEdges(UP)).toEqual([["children", "parents"]]);
  });

  it("accepts children dropped before parents, ignoring comments", () => {
    const down = `-- reviewed\nDROP TABLE "children";\n/* note */\nDROP TABLE "parents"; -- last\n`;
    expect(checkDownSql(down, UP)).toEqual({ ok: true, tables: ["children", "parents"], functions: [] });
  });

  it("refuses the wrong order", () => {
    expect(problemsOf('DROP TABLE "parents";\nDROP TABLE "children";')).toEqual(['drops parents before children, which references it']);
  });

  it("refuses a missing table, an extra table and a repeated table", () => {
    expect(problemsOf('DROP TABLE "children";')).toContain('does not drop parents, which the forward migration creates');
    expect(problemsOf('DROP TABLE "children";\nDROP TABLE "parents";\nDROP TABLE "other";')).toContain('drops other, which the forward migration does not create');
    expect(problemsOf('DROP TABLE "children";\nDROP TABLE "children";\nDROP TABLE "parents";')).toContain("drops children more than once");
  });

  it("refuses CASCADE and IF EXISTS", () => {
    expect(problemsOf('DROP TABLE "children";\nDROP TABLE "parents" CASCADE;')).toContain("contains the forbidden text CASCADE");
    expect(problemsOf('DROP TABLE IF EXISTS "children";\nDROP TABLE "parents";')).toContain("contains the forbidden text IF EXISTS");
  });

  it("refuses every other kind of statement", () => {
    const base = 'DROP TABLE "children";\nDROP TABLE "parents";\n';
    for (const extra of [
      'DELETE FROM "_prisma_migrations" WHERE migration_name = \'x\';',
      'DROP SCHEMA public;',
      'DROP DATABASE platterly_platform_test;',
      'TRUNCATE "parents";',
      'UPDATE "parents" SET id = id;',
      'ALTER TABLE "parents" DROP COLUMN "id";',
      'INSERT INTO "parents" VALUES (1);',
      'GRANT ALL ON "parents" TO someone;',
      'DROP INDEX "x";',
      'DROP TABLE parents;',
    ]) {
      expect(problemsOf(base + extra).length, extra).toBeGreaterThan(0);
    }
  });

  it("refuses an empty file, trailing text and a missing final semicolon", () => {
    expect(problemsOf("-- nothing")).not.toEqual([]);
    expect(problemsOf("")).not.toEqual([]);
    expect(problemsOf('DROP TABLE "children";\nDROP TABLE "parents"')).not.toEqual([]);
    expect(problemsOf('DROP TABLE "children";\nDROP TABLE "parents";\nselect 1')).not.toEqual([]);
  });

  it("refuses string literals and dollar quoting", () => {
    expect(problemsOf('DROP TABLE "children";\nDROP TABLE "parents";\nSELECT \'x\';')).not.toEqual([]);
    expect(problemsOf('DROP TABLE "children";\nDROP TABLE "parents";\nDO $$ BEGIN END $$;')).not.toEqual([]);
  });

  describe("functions created by the forward migration (F3.2.1)", () => {
    const UP_FN = `${UP}
CREATE FUNCTION "guard_a"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE FUNCTION "guard_b"(org_id TEXT) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
`;
    const TABLES = 'DROP TABLE "children";\nDROP TABLE "parents";\n';
    const problemsFn = (down: string) => {
      const result = checkDownSql(down, UP_FN);
      return result.ok ? [] : result.problems;
    };

    it("is not fooled by a quoted name that contains a forbidden word, but still refuses the word as a statement", () => {
      const UP_WORDS = `${UP}\nCREATE FUNCTION "parents_before_delete"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN OLD; END $$;\n`;
      const ok = checkDownSql('DROP TABLE "children";\nDROP TABLE "parents";\nDROP FUNCTION "parents_before_delete"();', UP_WORDS);
      expect(ok).toEqual({ ok: true, tables: ["children", "parents"], functions: ["parents_before_delete"] });
      const bad = checkDownSql('DROP TABLE "children";\nDROP TABLE "parents";\nDROP FUNCTION "parents_before_delete"();\nDELETE FROM "parents";', UP_WORDS);
      expect(bad.ok).toBe(false);
    });

    it("reads the functions of the forward migration", () => {
      expect(createdFunctions(UP_FN)).toEqual(["guard_a", "guard_b"]);
    });

    it("accepts every table dropped first and then every function exactly once", () => {
      const result = checkDownSql(`${TABLES}DROP FUNCTION "guard_a"();\nDROP FUNCTION "guard_b"(TEXT);\n`, UP_FN);
      expect(result).toEqual({ ok: true, tables: ["children", "parents"], functions: ["guard_a", "guard_b"] });
    });

    it("refuses a function the migration did not create, a repeated function and a missing function", () => {
      expect(problemsFn(`${TABLES}DROP FUNCTION "guard_a"();\nDROP FUNCTION "guard_b"(TEXT);\nDROP FUNCTION "other"();`)).toContain("drops the function other, which the forward migration does not create");
      expect(problemsFn(`${TABLES}DROP FUNCTION "guard_a"();\nDROP FUNCTION "guard_a"();\nDROP FUNCTION "guard_b"(TEXT);`)).toContain("drops the function guard_a more than once");
      expect(problemsFn(`${TABLES}DROP FUNCTION "guard_a"();`)).toContain("does not drop the function guard_b, which the forward migration creates");
    });

    it("refuses a function dropped before the last table, CASCADE and unquoted names", () => {
      expect(problemsFn('DROP TABLE "children";\nDROP FUNCTION "guard_a"();\nDROP TABLE "parents";\nDROP FUNCTION "guard_b"(TEXT);')).toContain("drops a function before the last table");
      expect(problemsFn(`${TABLES}DROP FUNCTION "guard_a"() CASCADE;\nDROP FUNCTION "guard_b"(TEXT);`)).toContain("contains the forbidden text CASCADE");
      expect(problemsFn(`${TABLES}DROP FUNCTION guard_a();\nDROP FUNCTION "guard_b"(TEXT);`).length).toBeGreaterThan(0);
    });
  });
});
