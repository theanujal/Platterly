import { describe, it, expect } from "vitest";
import { findProblems, check } from "../../../../scripts/check-migrations.mjs";

describe("migration safety guard", () => {
  it("flags statements that can remove or rewrite kitchens' data", () => {
    for (const sql of [
      'ALTER TABLE "order" DROP COLUMN "x";',
      'DROP TABLE "customer";',
      "TRUNCATE TABLE foo;",
      'DELETE FROM "payment";',
      'ALTER TABLE "a" ALTER COLUMN "b" TYPE INTEGER;',
      'ALTER TABLE "a" ALTER COLUMN "b" SET NOT NULL;',
      'ALTER TABLE "a" RENAME COLUMN "b" TO "c";',
      'DROP TYPE "OrderStatus";',
    ]) expect(findProblems(sql).length, sql).toBeGreaterThan(0);
  });

  it("allows purely additive changes", () => {
    expect(findProblems('CREATE TABLE "x" ("id" TEXT NOT NULL);\nALTER TABLE "order" ADD COLUMN "note" TEXT;\nCREATE INDEX "i" ON "order"("note");')).toEqual([]);
  });

  it("ignores comments but honours an explicit approval line", () => {
    expect(findProblems('-- DROP TABLE "x" was considered\nALTER TABLE "a" ADD COLUMN "b" TEXT;')).toEqual([]);
    expect(findProblems('-- data-safe-approved: column was empty everywhere, checked in production\nALTER TABLE "a" DROP COLUMN "b";')).toEqual([]);
    expect(findProblems('-- data-safe-approved:\nALTER TABLE "a" DROP COLUMN "b";').length).toBeGreaterThan(0);
  });

  it("every migration added after the baseline is safe", () => {
    expect(check()).toEqual([]);
  });
});
