import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LlmError, streamChat, type LlmConfig } from '../src/ai/llmClient.js';

// A fake OpenAI-compatible server. Behaviour is picked by the model name.
let server: Server;
let config: LlmConfig;
let lastRequest: { headers: IncomingMessage['headers']; body: Record<string, unknown> } | null = null;

const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
const delta = (content: string) => sse({ choices: [{ delta: { content } }] });

beforeAll(async () => {
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw) as { model: string };
    lastRequest = { headers: req.headers, body };

    if (body.model === 'broken') {
      res.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"bad key"}');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    if (body.model === 'slow') return; // never answers
    // Split one event across writes and add noise a proxy might inject.
    const payload = `: keep-alive\n\n${sse({ choices: [{ delta: { role: 'assistant' } }] })}${delta('Xin ')}${delta('chào')}${delta(' bạn')}data: [DONE]\n\n`;
    for (let i = 0; i < payload.length; i += 7) {
      res.write(payload.slice(i, i + 7));
      await new Promise((r) => setTimeout(r, 1));
    }
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, r));
  config = {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    apiKey: 'sk-test',
    model: 'good',
    timeoutMs: 2000,
  };
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

async function collect(gen: AsyncGenerator<string>) {
  let out = '';
  for await (const t of gen) out += t;
  return out;
}

describe('streamChat', () => {
  it('reassembles content deltas from a chunked SSE stream', async () => {
    const text = await collect(streamChat([{ role: 'user', content: 'hi' }], { maxTokens: 50 }, config));
    expect(text).toBe('Xin chào bạn');
    expect(lastRequest?.headers.authorization).toBe('Bearer sk-test');
    expect(lastRequest?.body).toMatchObject({ model: 'good', stream: true, max_tokens: 50 });
  });

  it('raises LlmError with the HTTP status on failure', async () => {
    const err = await collect(streamChat([], { maxTokens: 10 }, { ...config, model: 'broken' })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).status).toBe(401);
  });

  it('gives up after the timeout', async () => {
    const started = Date.now();
    const err = await collect(streamChat([], { maxTokens: 10 }, { ...config, model: 'slow', timeoutMs: 300 })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
