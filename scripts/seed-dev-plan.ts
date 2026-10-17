// Adds one paid plan ("Standard") so /subscribe has something to sell in a local database when Ops billing is off (OPS_BILLING empty).
// Safe to run again: matched by code, an existing row is left exactly as it is (edit it in the database or Ops, not here). Never deletes.
// Local use only; production plans come from Platterly Ops. Run: npm run db:seed-dev-plan
import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL?.split("?")[0] });
try {
  const result = await pool.query(
    `insert into subscription_plan (id, code, name, description, "isTrial", "priceMonthly", "priceAnnual", currency, "gstPercent", highlights, "isActive", "updatedAt")
     values (gen_random_uuid()::text, 'standard', 'Standard', 'Everything a catering kitchen needs.', false, 999, 9990, 'INR', 18,
             array['Unlimited orders','Menu approvals','Kitchen and inventory tools'], true, now())
     on conflict (code) do nothing`,
  );
  console.log(result.rowCount ? "Added the Standard plan." : "The Standard plan already exists; nothing changed.");
} finally {
  await pool.end();
}
