# JudgeHint

Hệ thống chấm bài lập trình tự động + AI gợi ý lỗi. Đặc tả đầy đủ: [CLAUDE.md](CLAUDE.md).

## Yêu cầu

- Node.js ≥ 20, pnpm 9 (`npm i -g pnpm@9`)
- Docker Desktop (đang chạy)

## Chạy lần đầu

```bash
cp .env.example .env          # rồi điền JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
pnpm install                  # tự chạy prisma generate
pnpm db:up                    # Postgres (cổng 5433) + Redis (6379)
pnpm db:migrate               # áp migration
pnpm db:seed                  # 5 tài khoản demo, 7 bài, 1 lớp + 1 assignment
pnpm dev                      # web :5173, api :4000, judge-worker
```

Mở http://localhost:5173 — ô "Trạng thái hệ thống" phải xanh cả 3 dòng.

Tài khoản demo (chỉ dùng cho dev) được liệt kê ở đầu [seed/index.ts](seed/index.ts).

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `apps/web` | React 18 + Vite + Tailwind 4 (kiểu shadcn/ui) |
| `apps/api` | Express 5 + Zod, REST `/api` |
| `apps/judge-worker` | BullMQ worker, chạy code trong Docker sandbox |
| `packages/shared` | Enum, Zod schema, kiểu sự kiện dùng chung FE/BE |
| `packages/db` | Prisma client (generate từ `prisma/schema.prisma`) |
| `docker/compose` | Compose cho dev (và production sau này) |
| `docker/sandbox` | Image chấm bài: `pnpm build:sandbox` |
| `seed` | Dữ liệu demo |

## Lệnh hữu ích

| Lệnh | Việc |
|---|---|
| `pnpm typecheck` | Kiểm tra kiểu toàn bộ workspace |
| `pnpm test` | Chạy Vitest |
| `pnpm db:studio` | Mở Prisma Studio |
| `pnpm db:reset` | Xóa sạch DB, migrate lại và seed |
| `pnpm db:down` | Tắt Postgres/Redis |
