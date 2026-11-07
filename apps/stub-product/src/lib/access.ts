import type { Pool } from "pg";

export type MembershipView = { businessId: string; role: string; status: string; businessStatus: string };
export type Access = { allowed: boolean; memberships: MembershipView[] };

/**
 * What this person may do here, decided from the product's OWN copy of the memberships Platform has told it about, on every request. Access needs an
 * active membership in a business that is not suspended or closed. Removing or disabling a member, or suspending the business, closes access on the very
 * next request even though the person's sign-in session is still alive (the identity session is not the permission, Part 1 section 11).
 */
export async function accessFor(pool: Pool, sub: string): Promise<Access> {
  const { rows } = await pool.query(
    `select m.business_id, m.role, m.status, coalesce(b.status, 'active') as business_status
       from stub_membership m left join stub_business b on b.business_id = m.business_id
      where m.user_id = $1 order by m.business_id`,
    [sub],
  );
  const memberships = rows.map((r) => ({ businessId: r.business_id as string, role: r.role as string, status: r.status as string, businessStatus: r.business_status as string }));
  return { allowed: memberships.some((m) => m.status === "active" && m.businessStatus === "active"), memberships };
}
