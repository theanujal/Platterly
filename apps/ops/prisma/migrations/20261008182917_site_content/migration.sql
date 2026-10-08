-- CreateTable
CREATE TABLE "site_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "site_release" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'new',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_post" (
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT 'The Platterly team',
    "tags" TEXT[],
    "colourway" TEXT NOT NULL DEFAULT 'sunrise',
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_post_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "site_legal_page" (
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "updated" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_legal_page_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "site_publish" (
    "id" TEXT NOT NULL,
    "requestedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "message" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "site_publish_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_publish_requestedAt_idx" ON "site_publish"("requestedAt");
