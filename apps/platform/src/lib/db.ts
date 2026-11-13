import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  var __platformPrisma: PrismaClient | undefined;
  var __platformPool: Pool | undefined;
}

// UTC for every connection: the Prisma adapter treats a timestamptz as UTC, so a database set to another time zone would store and return every date shifted
// by its offset (see __tests__/db-timezone.test.ts). It is a start-up setting, so it holds for the whole life of the connection.
const pool = globalThis.__platformPool ?? new Pool({ connectionString: process.env.DATABASE_URL, options: "-c timezone=UTC" });

export const prisma = globalThis.__platformPrisma ?? new PrismaClient({ adapter: new PrismaPg(pool) });

if (process.env.NODE_ENV !== "production") {
  globalThis.__platformPool = pool;
  globalThis.__platformPrisma = prisma;
}
