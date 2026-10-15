import { Router } from 'express';
import type { HintLevel } from '@judgehint/shared';
import { LlmError } from '../../ai/llmClient.js';
import { logger } from '../../lib/logger.js';
import { openSse } from '../../lib/sse.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { hintStateQuerySchema, hintStreamQuerySchema } from './hints.schema.js';
import * as hintsService from './hints.service.js';

export const hintsRouter = Router();
hintsRouter.use(requireAuth);

hintsRouter.get('/', async (req, res) => {
  const { submissionId } = hintStateQuerySchema.parse(req.query);
  res.json(await hintsService.getHintState(submissionId, currentUser(req)));
});

/**
 * SSE: streams one hint level. Validation errors are returned as normal JSON before the stream
 * opens; once streaming, failures arrive as an `error` event.
 */
hintsRouter.get('/stream', async (req, res) => {
  const { submissionId, level: rawLevel } = hintStreamQuerySchema.parse(req.query);
  const level = rawLevel as HintLevel;
  const actor = currentUser(req);
  const prepared = await hintsService.prepareHint(submissionId, level, actor);

  const sse = openSse(res);
  if ('cached' in prepared) {
    sse.send('done', { level, content: prepared.cached.content, cached: true });
    sse.close();
    return;
  }

  const streamer = hintsService.getStreamer();
  if (!streamer) {
    sse.send('error', { code: 'AI_UNAVAILABLE', message: 'Gợi ý AI chưa được cấu hình' });
    sse.close();
    return;
  }

  const release = await hintsService.lockHint(submissionId, level);
  if (!release) {
    sse.send('error', { code: 'HINT_IN_PROGRESS', message: 'Gợi ý này đang được tạo ở một cửa sổ khác' });
    sse.close();
    return;
  }

  // Stop paying for tokens nobody will read.
  const abort = new AbortController();
  res.on('close', () => abort.abort());

  try {
    const { messages, maxTokens } = hintsService.hintMessages(prepared.context);
    let content = '';
    for await (const text of streamer(messages, { maxTokens, signal: abort.signal })) {
      content += text;
      sse.send('delta', { text });
    }
    if (abort.signal.aborted) return;
    content = content.trim();
    if (!content) throw new LlmError('Empty completion');

    // Leak guard (week 7) will run here and may send a `replace` event.
    const saved = await hintsService.saveHint(submissionId, level, content);
    sse.send('done', { level, content: saved.content, cached: false });
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
