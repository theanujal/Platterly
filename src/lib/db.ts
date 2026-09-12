import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  var __prisma: PrismaClient | undefined;
  var __pgPool: Pool | undefined;
}

const pool =
  globalThis.__pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL });

export const prisma =
  globalThis.__prisma ?? new PrismaClient({ adapter: new PrismaPg(pool) });

if (process.env.NODE_ENV !== "production") {
  globalThis.__pgPool = pool;
  globalThis.__prisma = prisma;
}
