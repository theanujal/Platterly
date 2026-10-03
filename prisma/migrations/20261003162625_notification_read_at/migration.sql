-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "notification_recipientUserId_channel_readAt_idx" ON "notification"("recipientUserId", "channel", "readAt");
