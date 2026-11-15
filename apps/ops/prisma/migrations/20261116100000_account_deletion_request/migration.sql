-- Account deletion requests (Ops side of the single request made on the Account's My Profile page). A new table only: nothing existing is touched.
CREATE TABLE "account_deletion_request" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "businessId" TEXT,
    "businessName" TEXT,
    "products" JSONB NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "declineReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "eraseAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_deletion_request_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_deletion_request_requestId_key" ON "account_deletion_request"("requestId");
CREATE INDEX "account_deletion_request_status_createdAt_idx" ON "account_deletion_request"("status", "createdAt");
