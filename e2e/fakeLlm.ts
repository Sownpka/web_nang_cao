// Tiny OpenAI-compatible chat completions server that streams a fixed hint per level over SSE.
// Lets the hint flow run without 9router; GET /__requests shows what the API sent.
import { createServer, type Server } from 'node:http';

export interface RecordedRequest {
  model: string;
  stream: boolean;
  level: number;
}

/** Plain prose so the API's leak guard accepts it at every level. */
export function fakeHint(level: number): string {
  return (
    `Gợi ý E2E mức ${level}: chương trình đang tính sai phép toán chính mà đề bài yêu cầu. ` +
    'Em thử chạy tay với ví dụ đầu tiên rồi so sánh kết quả nhận được với kết quả mong đợi xem chênh lệch ở đâu?'
  );
}

export function startFakeLlm(port: number): Promise<Server> {
  const requests: RecordedRequest[] = [];

  const server = createServer((req, res) => {
    if (req.url === '/__requests') {
      if (req.method === 'DELETE') requests.length = 0;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(requests));
      return;
    }
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.writeHead(404).end();
      return;
    }

    let raw = '';
    req.on('data', (c: Buffer) => (raw += c.toString('utf8')));
    req.on('end', async () => {
      const body = JSON.parse(raw) as { model: string; stream?: boolean; messages: { content: string }[] };
      const prompt = body.messages.at(-1)?.content ?? '';
      const level = Number(/MỨC GỢI Ý: (\d)/.exec(prompt)?.[1] ?? 1);
      requests.push({ model: body.model, stream: !!body.stream, level });

      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      for (const word of fakeHint(level).split(/(?<= )/)) {
        const chunk = { id: 'e2e', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: word } }] };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        await new Promise((r) => setTimeout(r, 10));
      }
      res.end('data: [DONE]\n\n');
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
