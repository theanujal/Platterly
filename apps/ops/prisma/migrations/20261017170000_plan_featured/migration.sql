-- The plan the marketing site marks "Most popular". Additive: a new column (every existing plan starts unfeatured) and a partial
-- unique index so at most one plan per product can be featured, even if two saves race.
ALTER TABLE "plan" ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "plan_one_featured_per_product" ON "plan"("productKey") WHERE "isFeatured";
