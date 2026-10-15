import { prisma } from '@judgehint/db';
import type { AuthUser } from '@judgehint/shared';
import { HttpError } from '../../lib/httpError.js';
import { toAuthUser } from '../auth/auth.service.js';

export async function getMe(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw HttpError.unauthorized('Tài khoản không còn tồn tại', 'ACCOUNT_GONE');
  return toAuthUser(user);
}
