import "server-only";
import type { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "@/server/prisma-client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  createPrismaClient(process.env.DATABASE_URL, {
    // Never log query parameters: they can contain personal data.
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
