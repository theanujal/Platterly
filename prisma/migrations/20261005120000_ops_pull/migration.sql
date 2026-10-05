-- Ops link: when catering last pulled a business's snapshot from ops. Additive (one new table).
-- CreateTable
CREATE TABLE "ops_pull" (
    "businessId" TEXT NOT NULL,
    "lastPulledAt" TIMESTAMP(3) NOT NULL,
    "lastStatus" INTEGER NOT NULL,

    CONSTRAINT "ops_pull_pkey" PRIMARY KEY ("businessId")
);

