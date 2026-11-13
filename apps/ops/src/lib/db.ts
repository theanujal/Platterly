import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  var __opsPrisma: PrismaClient | undefined;
  var __opsPool: Pool | undefined;
}

// UTC for every connection, so a date the database fills in itself (now(), a default) agrees with what Prisma writes (see __tests__/db-timezone.test.ts).
const pool = globalThis.__opsPool ?? new Pool({ connectionString: process.env.DATABASE_URL, options: "-c timezone=UTC" });

export const prisma = globalThis.__opsPrisma ?? new PrismaClient({ adapter: new PrismaPg(pool) });

if (process.env.NODE_ENV !== "production") {
  globalThis.__opsPool = pool;
  globalThis.__opsPrisma = prisma;
}
