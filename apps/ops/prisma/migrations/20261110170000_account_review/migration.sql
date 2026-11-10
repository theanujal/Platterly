-- data-safe-approved: creates one new table; nothing existing is dropped, altered or rewritten.
CREATE TABLE "account_review" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "oldEmail" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "clearedAt" TIMESTAMP(3),
    "clearedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_review_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "account_review_reviewId_key" ON "account_review"("reviewId");
CREATE INDEX "account_review_status_createdAt_idx" ON "account_review"("status", "createdAt");
