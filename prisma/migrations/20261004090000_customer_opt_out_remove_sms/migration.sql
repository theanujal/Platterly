-- AlterEnum
BEGIN;
CREATE TYPE "NotificationChannel_new" AS ENUM ('WHATSAPP', 'EMAIL', 'IN_APP', 'PUSH');
ALTER TABLE "notification" ALTER COLUMN "channel" TYPE "NotificationChannel_new" USING ("channel"::text::"NotificationChannel_new");
ALTER TYPE "NotificationChannel" RENAME TO "NotificationChannel_old";
ALTER TYPE "NotificationChannel_new" RENAME TO "NotificationChannel";
DROP TYPE "public"."NotificationChannel_old";
COMMIT;

-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "marketingOptOutAt" TIMESTAMP(3);

