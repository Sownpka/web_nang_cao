// Prisma client is generated from /prisma/schema.prisma into ./generated (see generator output).
import { PrismaClient } from './generated/prisma/index.js';

export * from './generated/prisma/index.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Shared Prisma instance; reused across hot reloads in development. */
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
