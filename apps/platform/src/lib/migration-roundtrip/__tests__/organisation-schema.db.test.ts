import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCredentials, openGuarded, type Credentials } from "./db-target";

// F3.2.1 constraint and trigger tests against the real isolated Stage 2 PostgreSQL (127.0.0.1:55433, platterly_platform_test).
// The guard is opened once and fully released first (it refuses to run while another session is connected); no run-log rows are written.
// Every scenario runs inside a transaction that is rolled back, so no row is ever committed and the append-only audit log stays empty.
// Deferred checks are fired on purpose with SET CONSTRAINTS ALL IMMEDIATE, which is what COMMIT does. A before/after count of every table
// proves nothing leaked.
const credentials = loadCredentials(process.env.PLATFORM_TEST_CREDENTIALS_DIR);

type Attempt = { ok: true; rows: Record<string, unknown>[] } | { ok: false; code: string; constraint: string; message: string };

const bizId = () => `biz_${randomBytes(16).toString("hex")}`;
const HASH = "a".repeat(64);
const TABLES = ["users", "organisations", "organisation_members", "organisation_products", "membership_product_slots", "organisation_creation_requests", "organisation_product_unlinks", "audit_logs", "outbox_events"];

describe.skipIf(credentials === null)("F3.2.1 organisation schema constraints and triggers (isolated test database)", () => {
  const creds = credentials as Credentials;
  let db: Client;
  let before: Record<string, number> = {};

  const counts = async () => {
    const out: Record<string, number> = {};
    for (const t of TABLES) out[t] = Number((await db.query(`select count(*)::int as n from public."${t}"`)).rows[0].n);
    return out;
  };

  beforeAll(async () => {
    const target = await openGuarded(creds, { applicationName: "platform-f321-constraints-guard" });
    await target.close();
    db = new Client({ connectionString: creds.url(), application_name: "platform-f321-constraints" });
    await db.connect();
    before = await counts();
    expect(before, "every table must be empty before the test starts").toEqual(Object.fromEntries(TABLES.map((t) => [t, 0])));
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    try {
      expect(await counts(), "no scenario may leave a row behind").toEqual(before);
    } finally {
      await db.end();
    }
  });

  let savepoints = 0;
  const attempt = async (sql: string, values: unknown[] = []): Promise<Attempt> => {
    const name = `sp_${savepoints++}`;
    await db.query(`SAVEPOINT ${name}`);
    try {
      const result = await db.query(sql, values);
      await db.query(`RELEASE SAVEPOINT ${name}`);
      return { ok: true, rows: result.rows };
    } catch (error) {
      const e = error as { code?: string; constraint?: string; message?: string };
      await db.query(`ROLLBACK TO SAVEPOINT ${name}`);
      return { ok: false, code: e.code ?? "", constraint: e.constraint ?? "", message: e.message ?? "" };
    }
  };
  const must = async (sql: string, values: unknown[] = []) => {
    const r = await attempt(sql, values);
    if (!r.ok) throw new Error(`setup failed (${r.code} ${r.constraint}): ${r.message}`);
    return r.rows;
  };
  const refused = (r: Attempt, constraint: string) => expect({ ok: r.ok, constraint: r.ok ? "" : r.constraint, message: r.ok ? "" : r.message }).toMatchObject({ ok: false, constraint });
  const accepted = (r: Attempt) => expect(r.ok ? "ok" : `refused ${r.constraint}: ${r.message}`).toBe("ok");
  // What COMMIT does: fire every deferred check now. A refusal is rolled back to the savepoint; success returns to deferred mode.
  const commitCheck = async () => {
    const r = await attempt("SET CONSTRAINTS ALL IMMEDIATE");
    if (r.ok) await db.query("SET CONSTRAINTS ALL DEFERRED");
    return r;
  };

  async function scenario(fn: () => Promise<void>) {
    await db.query("BEGIN");
    try {
      await fn();
    } finally {
      await db.query("ROLLBACK");
    }
  }

  let userCounter = 0;
  const user = async () => String((await must("insert into users (email) values ($1) returning id", [`f321-${randomUUID()}-${userCounter++}@schema.invalid`]))[0].id);
  const org = async () => {
    const id = bizId();
    await must("insert into organisations (id, name) values ($1, 'Test Business')", [id]);
    return id;
  };
  const member = async (orgId: string, userId: string, status = "active") =>
    String((await must("insert into organisation_members (organisation_id, user_id, central_role, status) values ($1, $2, 'admin', $3) returning id", [orgId, userId, status]))[0].id);
  const product = (orgId: string, key = "alpha") => must("insert into organisation_products (organisation_id, product_key) values ($1, $2)", [orgId, key]);
  const audit = (action: string, subjectId: string, orgId: string | null = null) =>
    must(
      "insert into audit_logs (action, subject_type, subject_id, initiator_kind, initiator_ref, executor_kind, executor_ref, outcome, organisation_id) values ($1, 'slot', $2, 'system', 'test', 'system', 'test', 'done', $3)",
      [action, subjectId, orgId],
    );
  const orgRow = async (id: string) => (await must("select admin_established, link_established from organisations where id = $1", [id]))[0] as { admin_established: boolean; link_established: boolean };

  it("I-1: at most one active Admin per organisation, enforced by the partial unique index", () =>
    scenario(async () => {
      const o = await org();
      const [u1, u2] = [await user(), await user()];
      await member(o, u1);
      refused(await attempt("insert into organisation_members (organisation_id, user_id, central_role) values ($1, $2, 'admin')", [o, u2]), "organisation_members_one_active_admin_key");
      // A disabled Admin row for someone else is fine, and a replacement (old one disabled first, then the new one) commits.
      await must("insert into organisation_members (organisation_id, user_id, central_role, status) values ($1, $2, 'admin', 'disabled')", [o, u2]);
      await must("update organisation_members set status = 'disabled' where organisation_id = $1 and user_id = $2", [o, u1]);
      await must("update organisation_members set status = 'active' where organisation_id = $1 and user_id = $2", [o, u2]);
      accepted(await commitCheck());
    }));

  it("one membership row per person per organisation", () =>
    scenario(async () => {
      const o = await org();
      const u = await user();
      await member(o, u, "disabled");
      refused(await attempt("insert into organisation_members (organisation_id, user_id, central_role, status) values ($1, $2, 'admin', 'removed')", [o, u]), "organisation_members_organisation_id_user_id_key");
    }));

  it("TR-A: an organisation cannot be created already established", () =>
    scenario(async () => {
      refused(await attempt("insert into organisations (id, name, admin_established) values ($1, 'x', true)", [bizId()]), "organisations_admin_established_on_insert");
      refused(await attempt("insert into organisations (id, name, link_established) values ($1, 'x', true)", [bizId()]), "organisations_link_established_on_insert");
    }));

  it("TR-B / TR-C: the flags cannot be forged or undone, and only a real Admin row or link sets them", () =>
    scenario(async () => {
      const o = await org();
      expect(await orgRow(o)).toEqual({ admin_established: false, link_established: false });
      refused(await attempt("update organisations set admin_established = true where id = $1", [o]), "organisations_admin_established_requires_admin");
      refused(await attempt("update organisations set link_established = true where id = $1", [o]), "organisations_link_established_requires_link");
      await member(o, await user());
      expect((await orgRow(o)).admin_established).toBe(true);
      refused(await attempt("update organisations set admin_established = false where id = $1", [o]), "organisations_admin_established_monotonic");
      await product(o);
      expect((await orgRow(o)).link_established).toBe(true);
      refused(await attempt("update organisations set link_established = false where id = $1", [o]), "organisations_link_established_monotonic");
      accepted(await commitCheck());
    }));

  it("a disabled Admin row does not establish the organisation (P1: unclaimed is allowed, and it commits)", () =>
    scenario(async () => {
      const o = await org();
      await member(o, await user(), "disabled");
      expect((await orgRow(o)).admin_established).toBe(false);
      accepted(await commitCheck());
    }));

  it("the organisation id never changes", () =>
    scenario(async () => {
      const o = await org();
      refused(await attempt("update organisations set id = $2 where id = $1", [o, bizId()]), "organisations_id_immutable");
    }));

  it("TR-D / TR-E: an established organisation never has zero Admins at commit (disable, remove, or organisation update)", () =>
    scenario(async () => {
      const o = await org();
      const u = await user();
      await member(o, u);
      accepted(await commitCheck());
      await must("update organisation_members set status = 'disabled' where organisation_id = $1", [o]);
      refused(await commitCheck(), "organisations_admin_floor");
      await must("update organisation_members set status = 'removed' where organisation_id = $1", [o]);
      refused(await commitCheck(), "organisations_admin_floor");
      // Touching the organisation row alone also fires the check.
      await must("update organisations set name = 'Renamed' where id = $1", [o]);
      refused(await commitCheck(), "organisations_admin_floor");
    }));

  it("an unestablished organisation can have no Admin at all, and an established one with exactly one is fine", () =>
    scenario(async () => {
      await org();
      accepted(await commitCheck());
      const o = await org();
      await member(o, await user());
      accepted(await commitCheck());
    }));

  it("I-4: an Admin row keeps its organisation, person and id, and is never deleted on its own", () =>
    scenario(async () => {
      const [o1, o2] = [await org(), await org()];
      const [u1, u2] = [await user(), await user()];
      const m = await member(o1, u1);
      refused(await attempt("update organisation_members set user_id = $2 where id = $1", [m, u2]), "organisation_members_admin_user_immutable");
      refused(await attempt("update organisation_members set organisation_id = $2 where id = $1", [m, o2]), "organisation_members_organisation_immutable");
      refused(await attempt("update organisation_members set id = $2 where id = $1", [m, randomUUID()]), "organisation_members_id_immutable");
      refused(await attempt("delete from organisation_members where id = $1", [m]), "organisation_members_admin_never_deleted");
    }));

  it("deleting the organisation by hand cascades to its children, and the audit and outbox history survives", () =>
    scenario(async () => {
      const o = await org();
      await member(o, await user());
      await product(o);
      await must("insert into organisation_product_unlinks (organisation_id, product_key, organisation_sequence, unlinked_by) values ($1, 'beta', 1, 'staff')", [o]);
      await must("insert into organisation_creation_requests (user_id, idempotency_key, request_hash, organisation_id) select user_id, 'abcdefgh', $2, organisation_id from organisation_members where organisation_id = $1", [o, HASH]);
      await audit("organisation.created", o, o);
      await must("insert into outbox_events (event_id, organisation_id, product_key, event_type, payload, sequence) values ($1, $2, 'alpha', 'x', '{}', 1)", [randomUUID(), o]);
      await must("delete from organisations where id = $1", [o]);
      accepted(await commitCheck());
      for (const t of ["organisation_members", "organisation_products", "organisation_product_unlinks", "organisation_creation_requests"]) {
        expect(Number((await must(`select count(*)::int as n from ${t} where organisation_id = $1`, [o]))[0].n), t).toBe(0);
      }
      expect(Number((await must("select count(*)::int as n from audit_logs where organisation_id = $1", [o]))[0].n)).toBe(1);
      expect(Number((await must("select count(*)::int as n from outbox_events where organisation_id = $1", [o]))[0].n)).toBe(1);
    }));

  it("audit and outbox accept an organisation id that does not exist (no foreign key)", () =>
    scenario(async () => {
      await audit("organisation.gone", randomUUID(), bizId());
      await must("insert into outbox_events (event_id, organisation_id, product_key, event_type, payload, sequence) values ($1, $2, 'alpha', 'x', '{}', 1)", [randomUUID(), bizId()]);
    }));

  it("last link: the first link sets link_established, and the last link of an established organisation cannot be removed", () =>
    scenario(async () => {
      const o = await org();
      await product(o, "alpha");
      await product(o, "beta");
      await must("delete from organisation_products where organisation_id = $1 and product_key = 'beta'", [o]);
      accepted(await commitCheck());
      await must("delete from organisation_products where organisation_id = $1 and product_key = 'alpha'", [o]);
      refused(await commitCheck(), "organisation_products_last_link");
    }));

  it("slot identity: one slot per person per product, one per membership per product, and the foreign keys tie it to a linked product and its own member", () =>
    scenario(async () => {
      const [o1, o2] = [await org(), await org()];
      const [u1, u2] = [await user(), await user()];
      const m1 = await member(o1, u1);
      // One person is the active Admin of at most one business (20261107160000), so this person's second membership is a disabled one: the slot rules under test are the same.
      const m2 = await member(o2, u1, "disabled");
      const m3 = await member(o2, u2, "disabled");
      await product(o1);
      await product(o2);
      const slot = (id: string, u: string, o: string, m: string, key = "alpha") =>
        attempt("insert into membership_product_slots (slot_id, user_id, product_key, organisation_id, member_id) values ($1, $2, $3, $4, $5)", [id, u, key, o, m]);
      const s1 = randomUUID();
      accepted(await slot(s1, u1, o1, m1));
      await audit("slot.allocated", s1, o1);
      // G1: the same person cannot hold the same product in two organisations.
      refused(await slot(randomUUID(), u1, o2, m2), "membership_product_slots_user_id_product_key_key");
      // G2: the same membership cannot hold the same product twice (the person key fires first for one person, so use a second slot row for the same member id).
      const g2 = await attempt("insert into membership_product_slots (user_id, product_key, organisation_id, member_id) values ($1, 'alpha', $2, $3)", [u1, o1, m1]);
      expect(g2.ok ? "ok" : g2.constraint).toMatch(/^membership_product_slots_(user_id|member_id)_product_key_key$/);
      // A slot needs the product to be linked to that organisation, and the member to belong to that organisation and person.
      refused(await slot(randomUUID(), u2, o2, m3, "beta"), "membership_product_slots_organisation_id_product_key_fkey");
      await product(o2, "beta");
      refused(await slot(randomUUID(), u2, o2, m1, "beta"), "membership_product_slots_member_id_organisation_id_user_id_fkey");
      await commitCheck().then(accepted);
    }));

  it("slot events: every allocation and release needs its history event by commit, and a slot row never changes", () =>
    scenario(async () => {
      const o = await org();
      const u = await user();
      const m = await member(o, u);
      await product(o);
      const s = randomUUID();
      await must("insert into membership_product_slots (slot_id, user_id, product_key, organisation_id, member_id) values ($1, $2, 'alpha', $3, $4)", [s, u, o, m]);
      refused(await commitCheck(), "membership_product_slots_event_required");
      await audit("slot.allocated", s, o);
      accepted(await commitCheck());
      refused(await attempt("update membership_product_slots set allocated_at = now() where slot_id = $1", [s]), "membership_product_slots_immutable");
      await must("delete from membership_product_slots where slot_id = $1", [s]);
      refused(await commitCheck(), "membership_product_slots_event_required");
      await audit("slot.released", s, o);
      accepted(await commitCheck());
    }));

  it("an event for a different slot, action or outcome does not satisfy the slot event check", () =>
    scenario(async () => {
      const o = await org();
      const u = await user();
      const m = await member(o, u);
      await product(o);
      const s = randomUUID();
      await must("insert into membership_product_slots (slot_id, user_id, product_key, organisation_id, member_id) values ($1, $2, 'alpha', $3, $4)", [s, u, o, m]);
      await audit("slot.allocated", randomUUID(), o);
      await audit("slot.released", s, o);
      await must(
        "insert into audit_logs (action, subject_type, subject_id, initiator_kind, initiator_ref, executor_kind, executor_ref, outcome, reason_code) values ('slot.allocated', 'slot', $1, 'system', 't', 'system', 't', 'refused', 'nope')",
        [s],
      );
      refused(await commitCheck(), "membership_product_slots_event_required");
    }));

  it("manual organisation deletion: refused while a slot row exists (the cascade removes members before slots), allowed once the slot is released", () =>
    scenario(async () => {
      const o = await org();
      const u = await user();
      const m = await member(o, u);
      await product(o);
      const s = randomUUID();
      await must("insert into membership_product_slots (slot_id, user_id, product_key, organisation_id, member_id) values ($1, $2, 'alpha', $3, $4)", [s, u, o, m]);
      await audit("slot.allocated", s, o);
      accepted(await commitCheck());
      // Finding: the NO ACTION key is checked at the end of each cascade statement, and the members cascade runs before the slots cascade,
      // so an organisation that still holds a slot cannot be deleted by hand. It fails safe (nothing is lost).
      refused(await attempt("delete from organisations where id = $1", [o]), "membership_product_slots_member_id_organisation_id_user_id_fkey");
      // Release the slot first (with its history event); then the organisation can be deleted.
      await must("delete from membership_product_slots where slot_id = $1", [s]);
      await audit("slot.released", s, o);
      accepted(await attempt("delete from organisations where id = $1", [o]));
      accepted(await commitCheck());
    }));

  it("the audit log is append-only: no update, no delete, no truncate", () =>
    scenario(async () => {
      await audit("a.b", randomUUID());
      refused(await attempt("update audit_logs set reason = 'x'"), "audit_logs_append_only");
      refused(await attempt("delete from audit_logs"), "audit_logs_append_only");
      refused(await attempt("truncate audit_logs"), "audit_logs_append_only");
    }));

  it("creation requests: one per person and idempotency key", () =>
    scenario(async () => {
      const o = await org();
      const u = await user();
      const insert = () => attempt("insert into organisation_creation_requests (user_id, idempotency_key, request_hash, organisation_id) values ($1, 'abcdefgh', $2, $3)", [u, HASH, o]);
      accepted(await insert());
      refused(await insert(), "organisation_creation_requests_user_id_idempotency_key_key");
    }));

  it("outbox: event id and per-organisation-and-product sequence are unique", () =>
    scenario(async () => {
      const o = bizId();
      const insert = (eventId: string, sequence: number) =>
        attempt("insert into outbox_events (event_id, organisation_id, product_key, event_type, payload, sequence) values ($1, $2, 'alpha', 'x', '{}', $3)", [eventId, o, sequence]);
      const e = randomUUID();
      accepted(await insert(e, 1));
      refused(await insert(e, 2), "outbox_events_event_id_key");
      refused(await insert(randomUUID(), 1), "outbox_events_organisation_id_product_key_sequence_key");
    }));

  describe("CHECK constraints refuse bad values", () => {
    type Case = [label: string, sql: string, values: (c: { o: string; u: string }) => unknown[], constraint: string];
    const auditBase = "initiator_kind, initiator_ref, executor_kind, executor_ref, outcome";
    const cases: Case[] = [
      ["organisation id format", "insert into organisations (id, name) values ($1, 'x')", () => ["bad"], "organisations_id_format"],
      ["organisation name blank", "insert into organisations (id, name) values ($1, '  ')", () => [bizId()], "organisations_name_not_blank"],
      ["organisation status", "insert into organisations (id, name, status) values ($1, 'x', 'gone')", () => [bizId()], "organisations_status_check"],
      ["organisation counters", "insert into organisations (id, name, membership_version) values ($1, 'x', -1)", () => [bizId()], "organisations_counters_check"],
      ["organisation import batch blank", "insert into organisations (id, name, import_batch_id) values ($1, 'x', ' ')", () => [bizId()], "organisations_import_batch_not_blank"],
      ["member role", "insert into organisation_members (organisation_id, user_id, central_role) values ($1, $2, 'owner')", (c) => [c.o, c.u], "organisation_members_central_role_check"],
      ["member status", "insert into organisation_members (organisation_id, user_id, central_role, status) values ($1, $2, 'admin', 'gone')", (c) => [c.o, c.u], "organisation_members_status_check"],
      ["product key format", "insert into organisation_products (organisation_id, product_key) values ($1, 'Bad')", (c) => [c.o], "organisation_products_product_key_format"],
      ["product status", "insert into organisation_products (organisation_id, product_key, status) values ($1, 'alpha', 'gone')", (c) => [c.o], "organisation_products_status_check"],
      ["slot product key format", "insert into membership_product_slots (user_id, product_key, organisation_id, member_id) values ($2, 'Bad', $1, gen_random_uuid())", (c) => [c.o, c.u], "membership_product_slots_product_key_format"],
      ["request key too short", `insert into organisation_creation_requests (user_id, idempotency_key, request_hash, organisation_id) values ($2, 'short', '${HASH}', $1)`, (c) => [c.o, c.u], "organisation_creation_requests_key_length"],
      ["request hash format", "insert into organisation_creation_requests (user_id, idempotency_key, request_hash, organisation_id) values ($2, 'abcdefgh', 'zz', $1)", (c) => [c.o, c.u], "organisation_creation_requests_hash_format"],
      ["unlink product key", "insert into organisation_product_unlinks (organisation_id, product_key, organisation_sequence, unlinked_by) values ($1, 'X', 1, 'staff')", (c) => [c.o], "organisation_product_unlinks_product_key_format"],
      ["unlink by blank", "insert into organisation_product_unlinks (organisation_id, product_key, organisation_sequence, unlinked_by) values ($1, 'alpha', 1, ' ')", (c) => [c.o], "organisation_product_unlinks_unlinked_by_not_blank"],
      ["unlink sequence", "insert into organisation_product_unlinks (organisation_id, product_key, organisation_sequence, unlinked_by) values ($1, 'alpha', -1, 'staff')", (c) => [c.o], "organisation_product_unlinks_sequence_check"],
      ["audit organisation id", `insert into audit_logs (action, ${auditBase}, organisation_id) values ('a', 'user', 'r', 'user', 'r', 'done', 'nope')`, () => [], "audit_logs_organisation_id_format"],
      ["audit action blank", `insert into audit_logs (action, ${auditBase}) values (' ', 'user', 'r', 'user', 'r', 'done')`, () => [], "audit_logs_action_not_blank"],
      ["audit initiator kind", `insert into audit_logs (action, ${auditBase}) values ('a', 'bot', 'r', 'user', 'r', 'done')`, () => [], "audit_logs_initiator_kind_check"],
      ["audit executor kind", `insert into audit_logs (action, ${auditBase}) values ('a', 'user', 'r', 'bot', 'r', 'done')`, () => [], "audit_logs_executor_kind_check"],
      ["audit initiator ref blank", `insert into audit_logs (action, ${auditBase}) values ('a', 'user', ' ', 'user', 'r', 'done')`, () => [], "audit_logs_initiator_ref_not_blank"],
      ["audit executor ref blank", `insert into audit_logs (action, ${auditBase}) values ('a', 'user', 'r', 'user', ' ', 'done')`, () => [], "audit_logs_executor_ref_not_blank"],
      ["audit outcome", `insert into audit_logs (action, ${auditBase}) values ('a', 'user', 'r', 'user', 'r', 'maybe')`, () => [], "audit_logs_outcome_check"],
      ["audit refusal needs a reason code", `insert into audit_logs (action, ${auditBase}) values ('a', 'user', 'r', 'user', 'r', 'refused')`, () => [], "audit_logs_refusal_has_reason_code"],
      ["outbox organisation id", "insert into outbox_events (event_id, organisation_id, product_key, event_type, payload, sequence) values (gen_random_uuid(), 'x', 'alpha', 't', '{}', 1)", () => [], "outbox_events_organisation_id_format"],
      ["outbox product key", "insert into outbox_events (event_id, organisation_id, product_key, event_type, payload, sequence) values (gen_random_uuid(), $1, 'Bad', 't', '{}', 1)", () => [bizId()], "outbox_events_product_key_format"],
      ["outbox event type blank", "insert into outbox_events (event_id, organisation_id, product_key, event_type, payload, sequence) values (gen_random_uuid(), $1, 'alpha', ' ', '{}', 1)", () => [bizId()], "outbox_events_event_type_not_blank"],
      ["outbox sequence", "insert into outbox_events (event_id, organisation_id, product_key, event_type, payload, sequence) values (gen_random_uuid(), $1, 'alpha', 't', '{}', 0)", () => [bizId()], "outbox_events_sequence_check"],
      ["outbox attempts", "insert into outbox_events (event_id, organisation_id, product_key, event_type, payload, sequence, attempts) values (gen_random_uuid(), $1, 'alpha', 't', '{}', 1, -1)", () => [bizId()], "outbox_events_attempts_check"],
      ["outbox status", "insert into outbox_events (event_id, organisation_id, product_key, event_type, payload, sequence, status) values (gen_random_uuid(), $1, 'alpha', 't', '{}', 1, 'lost')", () => [bizId()], "outbox_events_status_check"],
      ["outbox resolution value", "insert into outbox_events (event_id, organisation_id, product_key, event_type, payload, sequence, resolution) values (gen_random_uuid(), $1, 'alpha', 't', '{}', 1, 'bogus')", () => [bizId()], "outbox_events_resolution_check"],
      ["outbox resolved without evidence", "insert into outbox_events (event_id, organisation_id, product_key, event_type, payload, sequence, status, resolution, resolved_at, resolved_by) values (gen_random_uuid(), $1, 'alpha', 't', '{}', 1, 'resolved', 'waived', now(), 'staff')", () => [bizId()], "outbox_events_resolution_complete"],
      ["outbox evidence without resolved status", "insert into outbox_events (event_id, organisation_id, product_key, event_type, payload, sequence, resolution, resolved_at, resolved_by, resolution_evidence) values (gen_random_uuid(), $1, 'alpha', 't', '{}', 1, 'waived', now(), 'staff', '{}')", () => [bizId()], "outbox_events_resolution_complete"],
    ];
    for (const [label, sql, values, constraint] of cases) {
      it(label, () =>
        scenario(async () => {
          const o = await org();
          const u = await user();
          refused(await attempt(sql, values({ o, u })), constraint);
        }));
    }

    it("a fully resolved outbox row is accepted", () =>
      scenario(async () => {
        accepted(
          await attempt(
            "insert into outbox_events (event_id, organisation_id, product_key, event_type, payload, sequence, status, resolution, resolved_at, resolved_by, resolution_evidence) values (gen_random_uuid(), $1, 'alpha', 't', '{}', 1, 'resolved', 'waived', now(), 'staff', '{\"ref\":1}')",
            [bizId()],
          ),
        );
      }));
  });
});
