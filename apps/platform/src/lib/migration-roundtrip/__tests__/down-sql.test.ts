import { describe, expect, it } from "vitest";
import { checkDownSql, createdTables, foreignKeyEdges } from "../down-sql";

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
    expect(checkDownSql(down, UP)).toEqual({ ok: true, tables: ["children", "parents"] });
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
});
