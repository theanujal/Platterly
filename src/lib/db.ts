import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  var __prisma: PrismaClient | undefined;
  var __pgPool: Pool | undefined;
}

// UTC for every connection, so a date the database fills in itself (now(), a default) agrees with what Prisma writes (see __tests__/db-timezone.test.ts).
const pool =
  globalThis.__pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL, options: "-c timezone=UTC" });

export const prisma =
  globalThis.__prisma ?? new PrismaClient({ adapter: new PrismaPg(pool) });

if (process.env.NODE_ENV !== "production") {
  globalThis.__pgPool = pool;
  globalThis.__prisma = prisma;
}
