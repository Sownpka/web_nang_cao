// Exits 0 when the database has no users yet (so the demo seed should run), 1 otherwise.
import { prisma } from '@judgehint/db';

const users = await prisma.user.count();
await prisma.$disconnect();
process.exit(users === 0 ? 0 : 1);
