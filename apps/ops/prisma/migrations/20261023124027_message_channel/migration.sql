-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- AlterTable
ALTER TABLE "message_log" ADD COLUMN     "channel" "MessageChannel" NOT NULL DEFAULT 'EMAIL',
ADD COLUMN     "toPhone" TEXT;

