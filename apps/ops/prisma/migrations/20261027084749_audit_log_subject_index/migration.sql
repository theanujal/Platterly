-- CreateIndex
CREATE INDEX "audit_log_subject_createdAt_idx" ON "audit_log"("subject", "createdAt");
