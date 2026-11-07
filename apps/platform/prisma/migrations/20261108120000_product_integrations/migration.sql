-- data-safe-approved: new table only, nothing existing is dropped, altered or rewritten.
-- F6.1.1 product registry: product URL and per-direction signing secrets (stored encrypted by the application).
CREATE TABLE "product_integrations" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'current',
    "outbound_secret" TEXT NOT NULL,
    "outbound_secret_previous" TEXT,
    "inbound_secret" TEXT NOT NULL,
    "inbound_secret_previous" TEXT,
    "secrets_rotated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_integrations_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "product_integrations_status_check" CHECK (status IN ('current', 'needs_review', 'suspended'))
);
