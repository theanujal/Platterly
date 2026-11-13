import type { Pool } from "pg";
import { openHold } from "../account/hold";
import type { Guards } from "./transfer";

// The two facts a transfer must check that live in the IDENTITY database: an email change that can still be cancelled (waiting for its code, or done less than
// 24 hours ago), and an open account hold. The organisation services take them as `Guards` (they only see the Platform database).
export async function readGuards(pool: Pool, identityUserId: string, now: Date = new Date()): Promise<Guards> {
  const [open, hold] = await Promise.all([
    pool.query(`select 1 from "emailChange" where "userId" = $1 and (("status" = 'pending' and "codeExpiresAt" > $2) or ("status" = 'completed' and "holdUntil" > $2)) limit 1`, [identityUserId, now]),
    openHold(pool, identityUserId),
  ]);
  return { adminEmailChangeOpen: (open.rowCount ?? 0) > 0, adminOnHold: hold !== null };
}
