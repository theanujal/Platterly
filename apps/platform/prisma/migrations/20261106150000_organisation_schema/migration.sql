-- F3.2.1 organisation schema: organisations, organisation_members, organisation_products, membership_product_slots,
-- organisation_creation_requests, organisation_product_unlinks, audit_logs, outbox_events. New tables, functions and triggers only.
-- Approved by AJ (C16 prerequisite 4, SD-1 to SD-7, 2026-11-06). Nothing existing is altered, rewritten or deleted.
-- The CHECK constraints, partial unique index, functions and triggers after the Prisma-generated part are hand-added: Prisma cannot express them.
-- data-safe-approved: new tables only, nothing existing is dropped, altered or rewritten; the cascading deletes apply only to rows of the new tables when a staff member deletes an organisation by hand, and the audit log has no foreign key so its history survives that deletion.

-- CreateTable
CREATE TABLE "organisations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "ownership_locked" BOOLEAN NOT NULL DEFAULT false,
    "membership_version" BIGINT NOT NULL DEFAULT 0,
    "outbox_sequence" BIGINT NOT NULL DEFAULT 0,
    "admin_established" BOOLEAN NOT NULL DEFAULT false,
    "link_established" BOOLEAN NOT NULL DEFAULT false,
    "import_batch_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "central_role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisation_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation_products" (
    "organisation_id" TEXT NOT NULL,
    "product_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisation_products_pkey" PRIMARY KEY ("organisation_id","product_key")
);

-- CreateTable
CREATE TABLE "membership_product_slots" (
    "slot_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "product_key" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "member_id" UUID NOT NULL,
    "allocated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_product_slots_pkey" PRIMARY KEY ("slot_id")
);

-- CreateTable
CREATE TABLE "organisation_creation_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisation_creation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation_product_unlinks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" TEXT NOT NULL,
    "product_key" TEXT NOT NULL,
    "unlinked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organisation_sequence" BIGINT NOT NULL,
    "unlinked_by" TEXT NOT NULL,
    "relinked_at" TIMESTAMPTZ(3),

    CONSTRAINT "organisation_product_unlinks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organisation_id" TEXT,
    "action" TEXT NOT NULL,
    "subject_type" TEXT,
    "subject_id" TEXT,
    "initiator_kind" TEXT NOT NULL,
    "initiator_ref" TEXT NOT NULL,
    "executor_kind" TEXT NOT NULL,
    "executor_ref" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason_code" TEXT,
    "reason" TEXT,
    "case_ref" TEXT,
    "approval" JSONB,
    "before" JSONB,
    "after" JSONB,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "request_id" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "product_key" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sequence" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "delivered_at" TIMESTAMPTZ(3),
    "resolution" TEXT,
    "resolved_at" TIMESTAMPTZ(3),
    "resolved_by" TEXT,
    "resolution_evidence" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organisation_members_organisation_id_user_id_key" ON "organisation_members"("organisation_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_members_id_organisation_id_user_id_key" ON "organisation_members"("id", "organisation_id", "user_id");

-- CreateIndex
CREATE INDEX "organisation_members_user_id_idx" ON "organisation_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_product_slots_user_id_product_key_key" ON "membership_product_slots"("user_id", "product_key");

-- CreateIndex
CREATE UNIQUE INDEX "membership_product_slots_member_id_product_key_key" ON "membership_product_slots"("member_id", "product_key");

-- CreateIndex
CREATE INDEX "membership_product_slots_organisation_id_product_key_idx" ON "membership_product_slots"("organisation_id", "product_key");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_creation_requests_user_id_idempotency_key_key" ON "organisation_creation_requests"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "organisation_creation_requests_organisation_id_idx" ON "organisation_creation_requests"("organisation_id");

-- CreateIndex
CREATE INDEX "organisation_product_unlinks_organisation_id_product_key_idx" ON "organisation_product_unlinks"("organisation_id", "product_key");

-- CreateIndex
CREATE INDEX "audit_logs_organisation_id_occurred_at_idx" ON "audit_logs"("organisation_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_subject_type_subject_id_idx" ON "audit_logs"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_occurred_at_idx" ON "audit_logs"("action", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_event_id_key" ON "outbox_events"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_organisation_id_product_key_sequence_key" ON "outbox_events"("organisation_id", "product_key", "sequence");

-- CreateIndex
CREATE INDEX "outbox_events_status_next_attempt_at_idx" ON "outbox_events"("status", "next_attempt_at");

-- AddForeignKey
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "organisation_products" ADD CONSTRAINT "organisation_products_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "membership_product_slots" ADD CONSTRAINT "membership_product_slots_organisation_id_product_key_fkey" FOREIGN KEY ("organisation_id", "product_key") REFERENCES "organisation_products"("organisation_id", "product_key") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "membership_product_slots" ADD CONSTRAINT "membership_product_slots_member_id_organisation_id_user_id_fkey" FOREIGN KEY ("member_id", "organisation_id", "user_id") REFERENCES "organisation_members"("id", "organisation_id", "user_id") ON DELETE NO ACTION ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "organisation_creation_requests" ADD CONSTRAINT "organisation_creation_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "organisation_creation_requests" ADD CONSTRAINT "organisation_creation_requests_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "organisation_product_unlinks" ADD CONSTRAINT "organisation_product_unlinks_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- Hand-added CHECK constraints (not in the Prisma schema)

ALTER TABLE "organisations" ADD CONSTRAINT "organisations_id_format" CHECK ("id" ~ '^biz_[0-9a-f]{32}$');
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_name_not_blank" CHECK (btrim("name") <> '');
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_status_check" CHECK ("status" IN ('active', 'suspended'));
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_counters_check" CHECK ("membership_version" >= 0 AND "outbox_sequence" >= 0);
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_import_batch_not_blank" CHECK ("import_batch_id" IS NULL OR btrim("import_batch_id") <> '');

ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_central_role_check" CHECK ("central_role" IN ('admin'));
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_status_check" CHECK ("status" IN ('active', 'disabled', 'removed'));

ALTER TABLE "organisation_products" ADD CONSTRAINT "organisation_products_product_key_format" CHECK ("product_key" ~ '^[a-z][a-z0-9-]{1,31}$');
ALTER TABLE "organisation_products" ADD CONSTRAINT "organisation_products_status_check" CHECK ("status" IN ('active', 'suspended'));

ALTER TABLE "membership_product_slots" ADD CONSTRAINT "membership_product_slots_product_key_format" CHECK ("product_key" ~ '^[a-z][a-z0-9-]{1,31}$');

ALTER TABLE "organisation_creation_requests" ADD CONSTRAINT "organisation_creation_requests_key_length" CHECK (char_length("idempotency_key") BETWEEN 8 AND 100);
ALTER TABLE "organisation_creation_requests" ADD CONSTRAINT "organisation_creation_requests_hash_format" CHECK ("request_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "organisation_product_unlinks" ADD CONSTRAINT "organisation_product_unlinks_product_key_format" CHECK ("product_key" ~ '^[a-z][a-z0-9-]{1,31}$');
ALTER TABLE "organisation_product_unlinks" ADD CONSTRAINT "organisation_product_unlinks_unlinked_by_not_blank" CHECK (btrim("unlinked_by") <> '');
ALTER TABLE "organisation_product_unlinks" ADD CONSTRAINT "organisation_product_unlinks_sequence_check" CHECK ("organisation_sequence" >= 0);

-- The audit log has no foreign key to organisations (so its history survives a manual organisation deletion); the id is only format-checked.
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organisation_id_format" CHECK ("organisation_id" IS NULL OR "organisation_id" ~ '^biz_[0-9a-f]{32}$');
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_action_not_blank" CHECK (btrim("action") <> '');
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_initiator_kind_check" CHECK ("initiator_kind" IN ('user', 'staff', 'system'));
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_executor_kind_check" CHECK ("executor_kind" IN ('user', 'staff', 'system'));
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_initiator_ref_not_blank" CHECK (btrim("initiator_ref") <> '');
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_executor_ref_not_blank" CHECK (btrim("executor_ref") <> '');
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_outcome_check" CHECK ("outcome" IN ('done', 'refused'));
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_refusal_has_reason_code" CHECK ("outcome" <> 'refused' OR ("reason_code" IS NOT NULL AND btrim("reason_code") <> ''));

-- The outbox keeps organisation_id as plain text with no foreign key, for the same reason as the audit log.
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organisation_id_format" CHECK ("organisation_id" ~ '^biz_[0-9a-f]{32}$');
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_product_key_format" CHECK ("product_key" ~ '^[a-z][a-z0-9-]{1,31}$');
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_event_type_not_blank" CHECK (btrim("event_type") <> '');
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_sequence_check" CHECK ("sequence" > 0);
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_status_check" CHECK ("status" IN ('pending', 'delivered', 'dead', 'resolved'));
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_resolution_check" CHECK ("resolution" IS NULL OR "resolution" IN ('replayed', 'reconciled', 'waived'));
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_resolution_complete" CHECK (
  ("status" = 'resolved') = ("resolution" IS NOT NULL AND "resolved_at" IS NOT NULL AND "resolved_by" IS NOT NULL AND btrim("resolved_by") <> '' AND "resolution_evidence" IS NOT NULL)
);

-- I-1: at most one active Admin per organisation, enforced by the database whatever route writes the row (cannot be deferred).
CREATE UNIQUE INDEX "organisation_members_one_active_admin_key" ON "organisation_members"("organisation_id") WHERE "central_role" = 'admin' AND "status" = 'active';

-- Functions and triggers. Every refusal names a stable constraint (RAISE ... CONSTRAINT) so the application can map it to a reason code.

-- TR-A / TR-B: the flags on organisations can be neither forged nor undone.
CREATE FUNCTION "organisations_before_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."admin_established" THEN
    RAISE EXCEPTION 'an organisation is created unestablished' USING ERRCODE = 'check_violation', CONSTRAINT = 'organisations_admin_established_on_insert';
  END IF;
  IF NEW."link_established" THEN
    RAISE EXCEPTION 'an organisation is created without an established link' USING ERRCODE = 'check_violation', CONSTRAINT = 'organisations_link_established_on_insert';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION "organisations_before_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" <> OLD."id" THEN
    RAISE EXCEPTION 'the organisation id cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'organisations_id_immutable';
  END IF;
  IF OLD."admin_established" AND NOT NEW."admin_established" THEN
    RAISE EXCEPTION 'admin_established cannot go back to false' USING ERRCODE = 'check_violation', CONSTRAINT = 'organisations_admin_established_monotonic';
  END IF;
  IF NOT OLD."admin_established" AND NEW."admin_established" AND NOT EXISTS (
    SELECT 1 FROM "organisation_members" m WHERE m."organisation_id" = NEW."id" AND m."central_role" = 'admin' AND m."status" = 'active'
  ) THEN
    RAISE EXCEPTION 'admin_established needs an active Admin' USING ERRCODE = 'check_violation', CONSTRAINT = 'organisations_admin_established_requires_admin';
  END IF;
  IF OLD."link_established" AND NOT NEW."link_established" THEN
    RAISE EXCEPTION 'link_established cannot go back to false' USING ERRCODE = 'check_violation', CONSTRAINT = 'organisations_link_established_monotonic';
  END IF;
  IF NOT OLD."link_established" AND NEW."link_established" AND NOT EXISTS (
    SELECT 1 FROM "organisation_products" p WHERE p."organisation_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'link_established needs a link' USING ERRCODE = 'check_violation', CONSTRAINT = 'organisations_link_established_requires_link';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "organisations_before_insert" BEFORE INSERT ON "organisations" FOR EACH ROW EXECUTE FUNCTION "organisations_before_insert"();
CREATE TRIGGER "organisations_before_update" BEFORE UPDATE ON "organisations" FOR EACH ROW EXECUTE FUNCTION "organisations_before_update"();

-- TR-D / TR-E: an established organisation has exactly one active Admin at every commit. Both triggers take the organisation row lock first.
CREATE FUNCTION "organisation_admin_floor_check"(org_id TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  established BOOLEAN;
  admins INTEGER;
BEGIN
  SELECT o."admin_established" INTO established FROM "organisations" o WHERE o."id" = org_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF established THEN
    SELECT count(*) INTO admins FROM "organisation_members" m WHERE m."organisation_id" = org_id AND m."central_role" = 'admin' AND m."status" = 'active';
    IF admins <> 1 THEN
      RAISE EXCEPTION 'an established organisation must have exactly one active Admin' USING ERRCODE = 'check_violation', CONSTRAINT = 'organisations_admin_floor';
    END IF;
  END IF;
END
$$;

CREATE FUNCTION "organisation_members_floor_trigger"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM "organisation_admin_floor_check"(OLD."organisation_id");
  ELSE
    PERFORM "organisation_admin_floor_check"(NEW."organisation_id");
  END IF;
  RETURN NULL;
END
$$;

CREATE FUNCTION "organisations_floor_trigger"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM "organisation_admin_floor_check"(NEW."id");
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER "organisation_members_floor" AFTER INSERT OR UPDATE OR DELETE ON "organisation_members" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "organisation_members_floor_trigger"();
CREATE CONSTRAINT TRIGGER "organisations_floor" AFTER INSERT OR UPDATE ON "organisations" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW."admin_established") EXECUTE FUNCTION "organisations_floor_trigger"();

-- TR-C: the only way an organisation becomes established is by a real active Admin row. I-4: Admin rows keep their organisation and person and are never deleted.
CREATE FUNCTION "organisation_members_establish"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."central_role" = 'admin' AND NEW."status" = 'active' THEN
    UPDATE "organisations" SET "admin_established" = true WHERE "id" = NEW."organisation_id" AND NOT "admin_established";
  END IF;
  RETURN NULL;
END
$$;

CREATE FUNCTION "organisation_members_before_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."organisation_id" <> OLD."organisation_id" THEN
    RAISE EXCEPTION 'a member cannot move to another organisation' USING ERRCODE = 'check_violation', CONSTRAINT = 'organisation_members_organisation_immutable';
  END IF;
  IF OLD."central_role" = 'admin' AND NEW."user_id" <> OLD."user_id" THEN
    RAISE EXCEPTION 'the person of an Admin row cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'organisation_members_admin_user_immutable';
  END IF;
  IF NEW."id" <> OLD."id" THEN
    RAISE EXCEPTION 'the member id cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'organisation_members_id_immutable';
  END IF;
  RETURN NEW;
END
$$;

-- An Admin row can be deleted only while the organisation itself is being deleted by hand (the parent row is already gone when the cascade reaches the child).
CREATE FUNCTION "organisation_members_before_delete"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."central_role" = 'admin' AND EXISTS (SELECT 1 FROM "organisations" o WHERE o."id" = OLD."organisation_id") THEN
    RAISE EXCEPTION 'an Admin row is never deleted on its own' USING ERRCODE = 'check_violation', CONSTRAINT = 'organisation_members_admin_never_deleted';
  END IF;
  RETURN OLD;
END
$$;

CREATE TRIGGER "organisation_members_establish" AFTER INSERT OR UPDATE ON "organisation_members" FOR EACH ROW EXECUTE FUNCTION "organisation_members_establish"();
CREATE TRIGGER "organisation_members_before_update" BEFORE UPDATE ON "organisation_members" FOR EACH ROW EXECUTE FUNCTION "organisation_members_before_update"();
CREATE TRIGGER "organisation_members_before_delete" BEFORE DELETE ON "organisation_members" FOR EACH ROW EXECUTE FUNCTION "organisation_members_before_delete"();

-- Links: the first link sets link_established; the last link of an established organisation cannot be removed (the organisation row lock serialises unlinks).
CREATE FUNCTION "organisation_products_established"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "organisations" SET "link_established" = true WHERE "id" = NEW."organisation_id" AND NOT "link_established";
  RETURN NULL;
END
$$;

CREATE FUNCTION "organisation_products_last_link"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  established BOOLEAN;
BEGIN
  SELECT o."link_established" INTO established FROM "organisations" o WHERE o."id" = OLD."organisation_id" FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF established AND NOT EXISTS (SELECT 1 FROM "organisation_products" p WHERE p."organisation_id" = OLD."organisation_id") THEN
    RAISE EXCEPTION 'the last product link of an organisation cannot be removed' USING ERRCODE = 'check_violation', CONSTRAINT = 'organisation_products_last_link';
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER "organisation_products_established" AFTER INSERT ON "organisation_products" FOR EACH ROW EXECUTE FUNCTION "organisation_products_established"();
CREATE CONSTRAINT TRIGGER "organisation_products_last_link" AFTER DELETE ON "organisation_products" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "organisation_products_last_link"();

-- Slots: a slot row never changes; every allocation and every release must have its history event (audit row) for that exact slot_id by commit.
CREATE FUNCTION "membership_product_slots_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'a slot row never changes; release it and allocate a new one' USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_product_slots_immutable';
END
$$;

CREATE FUNCTION "membership_product_slots_event_required"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  needed TEXT;
  slot UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    needed := 'slot.released';
    slot := OLD."slot_id";
  ELSE
    needed := 'slot.allocated';
    slot := NEW."slot_id";
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "audit_logs" a
    WHERE a."action" = needed AND a."subject_type" = 'slot' AND a."subject_id" = slot::text AND a."outcome" = 'done'
  ) THEN
    RAISE EXCEPTION 'slot % needs its % history event', slot, needed USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_product_slots_event_required';
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER "membership_product_slots_immutable" BEFORE UPDATE ON "membership_product_slots" FOR EACH ROW EXECUTE FUNCTION "membership_product_slots_immutable"();
CREATE CONSTRAINT TRIGGER "membership_product_slots_allocation_event" AFTER INSERT ON "membership_product_slots" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "membership_product_slots_event_required"();
CREATE CONSTRAINT TRIGGER "membership_product_slots_release_event" AFTER DELETE ON "membership_product_slots" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "membership_product_slots_event_required"();

-- The audit log is append-only: no update, no delete, no truncate.
CREATE FUNCTION "audit_logs_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = 'check_violation', CONSTRAINT = 'audit_logs_append_only';
END
$$;

CREATE TRIGGER "audit_logs_no_change" BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION "audit_logs_append_only"();
CREATE TRIGGER "audit_logs_no_truncate" BEFORE TRUNCATE ON "audit_logs" FOR EACH STATEMENT EXECUTE FUNCTION "audit_logs_append_only"();
