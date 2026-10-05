import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  var __opsPrisma: PrismaClient | undefined;
  var __opsPool: Pool | undefined;
}

const pool = globalThis.__opsPool ?? new Pool({ connectionString: process.env.DATABASE_URL });

export const prisma = globalThis.__opsPrisma ?? new PrismaClient({ adapter: new PrismaPg(pool) });

if (process.env.NODE_ENV !== "production") {
  globalThis.__opsPool = pool;
  globalThis.__opsPrisma = prisma;
}
