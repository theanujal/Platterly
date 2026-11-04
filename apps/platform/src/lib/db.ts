import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  var __platformPrisma: PrismaClient | undefined;
  var __platformPool: Pool | undefined;
}

const pool = globalThis.__platformPool ?? new Pool({ connectionString: process.env.DATABASE_URL });

export const prisma = globalThis.__platformPrisma ?? new PrismaClient({ adapter: new PrismaPg(pool) });

if (process.env.NODE_ENV !== "production") {
  globalThis.__platformPool = pool;
  globalThis.__platformPrisma = prisma;
}
