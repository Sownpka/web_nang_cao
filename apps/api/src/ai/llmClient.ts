// Streaming client for an OpenAI-compatible chat completions endpoint (9router in production).
import { env, isProd } from '../config.js';
import { logger } from '../lib/logger.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamOptions {
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
}

export class LlmError extends Error {
  override name = 'LlmError';
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

/**
 * Parses an SSE byte stream from /chat/completions into content deltas.
 * Handles events split across network chunks and ignores comments / non-content deltas.
 */
export async function* parseCompletionStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      if (!data) continue;
      let parsed: { choices?: { delta?: { content?: string | null } }[]; error?: { message?: string } };
      try {
        parsed = JSON.parse(data);
      } catch {
        continue; // tolerate keep-alive noise from proxies
      }
      if (parsed.error) throw new LlmError(parsed.error.message ?? 'LLM stream error');
      const text = parsed.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  }
}

export async function* streamChat(messages: ChatMessage[], opts: StreamOptions, config: LlmConfig): AsyncGenerator<string> {
  const signals = [AbortSignal.timeout(config.timeoutMs), ...(opts.signal ? [opts.signal] : [])];
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature ?? 0.3,
      }),
      signal: AbortSignal.any(signals),
    });
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    throw new LlmError(`Cannot reach LLM: ${(err as Error).message}`);
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new LlmError(`LLM responded ${res.status}: ${detail.slice(0, 300)}`, res.status);
  }
  yield* parseCompletionStream(res.body);
}

/** Dev/test stand-in used when no LLM is configured: streams a canned hint word by word. */
export async function* mockStreamChat(messages: ChatMessage[], opts: StreamOptions): AsyncGenerator<string> {
  const level = /MỨC GỢI Ý: (\d)/.exec(messages.at(-1)?.content ?? '')?.[1] ?? '1';
  const text =
    `**[Gợi ý mẫu — chưa cấu hình LLM]** Đây là gợi ý mức ${level}. ` +
    'Hãy đọc lại đề và tự hỏi: chương trình đã xử lý đúng mọi trường hợp biên chưa, ví dụ khi dãy chỉ có một phần tử? ' +
    'Điền LLM_BASE_URL, LLM_API_KEY và LLM_MODEL trong .env để nhận gợi ý thật từ 9router.';
  for (const word of text.split(/(?<= )/)) {
    if (opts.signal?.aborted) return;
    await new Promise((r) => setTimeout(r, env.NODE_ENV === 'test' ? 0 : 25));
    yield word;
  }
}

export type ChatStreamer = (messages: ChatMessage[], opts: StreamOptions) => AsyncGenerator<string>;

/** The configured provider: 9router when set, the mock outside production, otherwise null. */
export function resolveChatStreamer(): ChatStreamer | null {
  if (env.LLM_BASE_URL && env.LLM_MODEL) {
    const config: LlmConfig = {
      baseUrl: env.LLM_BASE_URL,
      apiKey: env.LLM_API_KEY,
      model: env.LLM_MODEL,
      timeoutMs: env.LLM_TIMEOUT_MS,
    };
    return (messages, opts) => streamChat(messages, opts, config);
  }
  if (isProd) return null;
  logger.warn('LLM_BASE_URL/LLM_MODEL not set — using the mock hint provider');
  return mockStreamChat;
}
