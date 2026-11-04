-- F3.1.1 identity tables: users, user_identities, legacy_mappings. Additive only.
-- The CHECK constraints at the end are hand-added: Prisma cannot express them.

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "email_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "source_system" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "legacy_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_provider_subject_key" ON "user_identities"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_user_id_provider_key" ON "user_identities"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_mappings_source_system_kind_legacy_id_key" ON "legacy_mappings"("source_system", "kind", "legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_mappings_user_id_source_system_kind_key" ON "legacy_mappings"("user_id", "source_system", "kind");

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "legacy_mappings" ADD CONSTRAINT "legacy_mappings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Hand-added CHECK constraints (not in the Prisma schema)

-- Email is stored lower-case, non-empty and trimmed of exactly six ASCII characters, written by decimal code:
-- space 32, tab 9, line feed 10, vertical tab 11, form feed 12, carriage return 13. No backslash escapes are used.
ALTER TABLE "users" ADD CONSTRAINT "users_email_not_empty" CHECK (length("email") > 0);
ALTER TABLE "users" ADD CONSTRAINT "users_email_trimmed" CHECK ("email" = btrim("email", chr(32) || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)));
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));
ALTER TABLE "users" ADD CONSTRAINT "users_status_check" CHECK ("status" IN ('active', 'disabled'));

ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_provider_not_blank" CHECK (btrim("provider") <> '');
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_subject_not_blank" CHECK (btrim("subject") <> '');

-- Organisation mappings are deferred to F3.2.1; only user mappings are allowed for now. batch_id is NOT NULL only.
ALTER TABLE "legacy_mappings" ADD CONSTRAINT "legacy_mappings_kind_check" CHECK ("kind" = 'user');
ALTER TABLE "legacy_mappings" ADD CONSTRAINT "legacy_mappings_source_system_not_blank" CHECK (btrim("source_system") <> '');
ALTER TABLE "legacy_mappings" ADD CONSTRAINT "legacy_mappings_legacy_id_not_blank" CHECK (btrim("legacy_id") <> '');
