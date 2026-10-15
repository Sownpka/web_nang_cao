import { prisma } from '@judgehint/db';
import { hintMultiplier } from '@judgehint/shared';

export interface HintPenalty {
  hintsUsed: number;
  multiplier: number;
  solved: boolean;
}

/**
 * Hint levels a user opened on a problem before their first AC (CLAUDE.md §8). Hints opened
 * after solving it do not count. `before` limits the window, e.g. to an assignment's end.
 */
export async function hintPenaltyFor(userId: string, problemId: string, before?: Date): Promise<HintPenalty> {
  const firstAc = await prisma.submission.findFirst({
    where: { userId, problemId, verdict: 'ACCEPTED', ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  const cutoff = firstAc?.createdAt ?? before;
  const hintsUsed = await prisma.hint.count({
    where: {
      submission: { userId, problemId },
      ...(cutoff ? { createdAt: { lt: cutoff } } : {}),
    },
  });
  return { hintsUsed, multiplier: hintMultiplier(hintsUsed), solved: !!firstAc };
}
