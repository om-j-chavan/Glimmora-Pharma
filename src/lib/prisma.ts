import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Cache on globalThis in every environment, not just dev: a fresh
// PrismaClient means a fresh connection pool, and a Next.js production
// process that re-evaluates this module (route-level bundling, HMR-like
// chunk reloads) can otherwise silently leak connections until Postgres
// refuses new ones (P2037). The dev-only guard this used to have only
// protected against Next dev's HMR duplicating clients — production needs
// the same protection for the same reason.
globalForPrisma.prisma = prisma;
