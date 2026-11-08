-- CreateTable
CREATE TABLE "platform_command" (
    "commandId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_command_pkey" PRIMARY KEY ("commandId")
);

-- CreateTable
CREATE TABLE "platform_event_state" (
    "businessId" TEXT NOT NULL,
    "lastSequence" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_event_state_pkey" PRIMARY KEY ("businessId")
);

-- CreateTable
CREATE TABLE "platform_event" (
    "eventId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_event_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "platform_command_receivedAt_idx" ON "platform_command"("receivedAt");

-- CreateIndex
CREATE INDEX "platform_event_businessId_sequence_idx" ON "platform_event"("businessId", "sequence");
