-- CreateIndex
CREATE INDEX "notification_organizationId_event_idx" ON "notification"("organizationId", "event");
