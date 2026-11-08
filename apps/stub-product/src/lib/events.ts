import { receiveEvent, type PlatformEvent } from "@platterly/platform-contract";
import type { Pool, PoolClient } from "pg";

export type EventOutcome = { status: 200; applied: boolean } | { status: 401 | 400; error: string };

async function apply(client: PoolClient, event: PlatformEvent): Promise<void> {
  if (event.type === "membership.changed") {
    const d = event.data;
    await client.query(
      `insert into stub_membership (business_id, user_id, role, status, membership_version) values ($1, $2, $3, $4, $5)
       on conflict (business_id, user_id) do update set role = excluded.role, status = excluded.status, membership_version = excluded.membership_version, updated_at = now()`,
      [event.businessId, d.userId, d.role, d.status, d.membershipVersion],
    );
  } else if (event.type === "organisation.status") {
    await client.query(
      `insert into stub_business (business_id, status) values ($1, $2) on conflict (business_id) do update set status = excluded.status, updated_at = now()`,
      [event.businessId, event.data.status],
    );
  } else if (event.type === "owner.changed") {
    await client.query(
      `insert into stub_business (business_id, status, owner_user_ids, billing_contact_email) values ($1, 'active', $2, $3)
       on conflict (business_id) do update set owner_user_ids = excluded.owner_user_ids, billing_contact_email = excluded.billing_contact_email, updated_at = now()`,
      [event.businessId, event.data.ownerUserIds, event.data.billingContactEmail],
    );
  }
}

/**
 * The product's event endpoint (Platform -> product, F6.2.1). Verify first, then parse, then the sequence guard (all in `receiveEvent`); a duplicate or
 * older event is acknowledged with 200 and changes nothing, so the sender stops retrying. The sequence is advanced in the SAME transaction as the change,
 * and only if it is higher, so two deliveries racing each other cannot both apply and an event can never be half applied.
 */
export async function handleEvent(input: { pool: Pool; secrets: readonly string[]; headers: Headers | Record<string, string | string[] | undefined>; rawBody: string; method: string; url: string | URL; now?: number }): Promise<EventOutcome> {
  const received = await receiveEvent({
    secrets: input.secrets,
    headers: input.headers,
    rawBody: input.rawBody,
    method: input.method,
    url: input.url,
    now: input.now,
    lastApplied: async (businessId) => {
      const { rows } = await input.pool.query(`select last_sequence from stub_business_sequence where business_id = $1`, [businessId]);
      return rows[0] ? (rows[0].last_sequence as number) : null;
    },
  });
  if (!received.ok) return { status: received.reason === "bad_json" || received.reason === "invalid_event" || received.reason === "id_mismatch" ? 400 : 401, error: received.reason };
  if (!received.apply) return { status: 200, applied: false };

  const client = await input.pool.connect();
  try {
    await client.query("begin");
    const advanced = await client.query(
      `insert into stub_business_sequence (business_id, last_sequence) values ($1, $2)
       on conflict (business_id) do update set last_sequence = excluded.last_sequence where stub_business_sequence.last_sequence < excluded.last_sequence
       returning 1`,
      [received.event.businessId, received.event.sequence],
    );
    if (advanced.rowCount !== 1) {
      await client.query("rollback"); // another delivery got there first
      return { status: 200, applied: false };
    }
    await apply(client, received.event);
    await client.query(`insert into stub_event_log (event_id, business_id, sequence, type) values ($1, $2, $3, $4) on conflict (event_id) do nothing`, [received.event.eventId, received.event.businessId, received.event.sequence, received.event.type]);
    await client.query("commit");
    return { status: 200, applied: true };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
