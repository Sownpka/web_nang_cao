import { Router } from 'express';
import type { HintLevel } from '@judgehint/shared';
import { env } from '../../config.js';
import { logger } from '../../lib/logger.js';
import { openSse, type SseChannel } from '../../lib/sse.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { hintStateQuerySchema, hintStreamQuerySchema } from './hints.schema.js';
import * as hintsService from './hints.service.js';

export const hintsRouter = Router();
hintsRouter.use(requireAuth);

hintsRouter.get('/', async (req, res) => {
  const { submissionId } = hintStateQuerySchema.parse(req.query);
  res.json(await hintsService.getHintState(submissionId, currentUser(req)));
});

/** Replays approved text in small pieces so it still reads like live typing. */
async function replay(sse: SseChannel, content: string, signal: AbortSignal) {
  const pieces = content.match(/\S+\s*|\s+/g) ?? [content];
  const delay = env.NODE_ENV === 'test' ? 0 : 18;
  for (let i = 0; i < pieces.length; i += 2) {
    if (signal.aborted) return;
    sse.send('delta', { text: pieces.slice(i, i + 2).join('') });
    if (delay) await new Promise((r) => setTimeout(r, delay));
  }
}

/**
 * SSE: one hint level. Validation, quota and lock errors are plain JSON before the stream opens.
 * The model's answer is fully generated and leak-checked before any text is sent, so nothing
 * unapproved ever reaches the browser (not even through DevTools).
 */
hintsRouter.get('/stream', async (req, res) => {
  const { submissionId, level: rawLevel } = hintStreamQuerySchema.parse(req.query);
  const level = rawLevel as HintLevel;
  const actor = currentUser(req);
  const prepared = await hintsService.prepareHint(submissionId, level, actor);

  const abort = new AbortController();
  res.on('close', () => abort.abort());

  if (prepared.kind === 'stored') {
    const sse = openSse(res);
    sse.send('done', { level, content: prepared.hint.content, cached: true, blocked: prepared.hint.blocked });
    sse.close();
    return;
  }

  const streamer = hintsService.getStreamer();
  if (!streamer) {
    res.status(503).json({ error: { code: 'AI_UNAVAILABLE', message: 'Gợi ý AI chưa được cấu hình' } });
    return;
  }
  const release = await hintsService.lockHint(submissionId, level);
  if (!release) {
    res.status(409).json({ error: { code: 'HINT_IN_PROGRESS', message: 'Gợi ý này đang được tạo ở một cửa sổ khác' } });
    return;
  }

  const sse = openSse(res);
  try {
    const hint = await hintsService.generateGuardedHint(prepared.context, prepared.guard, streamer, abort.signal, (phase, chars) =>
      sse.send('status', { phase, chars }),
    );
    if (abort.signal.aborted) return;
    // Store first: a dropped connection during replay must not lose a hint the student paid for.
    const saved = await hintsService.saveHint(submissionId, level, hint.content, hint.blocked);
    await hintsService.recordGeneration(actor, prepared.cacheKey, hint);
    await replay(sse, saved.content, abort.signal);
    sse.send('done', { level, content: saved.content, cached: false, blocked: saved.blocked });
  } catch (err) {
    if (!abort.signal.aborted) {
      logger.error({ submissionId, level, err: (err as Error).message }, 'hint generation failed');
      sse.send('error', { code: 'AI_UNAVAILABLE', message: 'Không tạo được gợi ý lúc này, vui lòng thử lại sau' });
    }
  } finally {
    await release();
    sse.close();
  }
});
