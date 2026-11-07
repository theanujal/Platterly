-- CreateTable
CREATE TABLE "platform_reader" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "secret" TEXT NOT NULL,
    "secretPrevious" TEXT,
    "rotatedAt" TIMESTAMP(3),
    "listVersion" INTEGER NOT NULL DEFAULT 0,
    "listHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_reader_pkey" PRIMARY KEY ("id")
);
