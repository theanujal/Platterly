-- data-safe-approved: adds one nullable column to platform_event_state; no existing value is changed, dropped or rewritten.
ALTER TABLE "platform_event_state" ADD COLUMN "lastPulledAt" TIMESTAMP(3);
