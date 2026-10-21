# JudgeHint

Hệ thống chấm bài lập trình tự động + AI gợi ý lỗi. Đặc tả đầy đủ: [CLAUDE.md](CLAUDE.md) · Báo cáo: [docs/report/bao-cao.pdf](docs/report/bao-cao.pdf).

[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)

- **Bản deploy:** https://judge.hxnos.com
- **Tài khoản demo:** sinh viên `sv1@judgehint.local`, giảng viên `teacher@judgehint.local` — mật khẩu `judgehint123` khi chạy local (bản deploy dùng mật khẩu riêng, xem báo cáo). Mã lớp demo: `WEB2026`.

## Chạy bằng một lệnh (Docker)

Chỉ cần Docker (Docker Desktop trên Windows/macOS):

```bash
docker compose up --build
```

Mở http://localhost:8080. Lần đầu mất vài phút để build image; compose tự dựng PostgreSQL, Redis, 3 image sandbox (Python, Node, g++), áp migration, nạp dữ liệu demo vào DB trống, rồi chạy api, judge-worker và web (nginx). Không cần `.env`: JWT secret được sinh ngẫu nhiên lần đầu và lưu trong volume `secrets`.

Tùy chọn (đặt trong `.env` ở thư mục gốc, xem [.env.example](.env.example)):

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | trống | Endpoint 9router/OpenAI. Trống → bộ giả lập gợi ý. `localhost` được tự đổi thành máy host |
| `WEB_PORT` | `8080` | Cổng web trên máy host |
| `PUBLIC_ORIGIN` | `http://localhost:8080` | Origin công khai khi deploy, vd. `https://judge.hxnos.com` |
| `SEED_DEMO` | `auto` | `auto` chỉ seed DB trống, `always` seed lại mỗi lần, `never` bỏ qua |
| `SEED_DEMO_PASSWORD` | `judgehint123` | Mật khẩu tài khoản demo — **bắt buộc đổi khi deploy công khai** |
| `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | tự sinh / mặc định | Nên đặt khi deploy |

Dừng: `docker compose down` (thêm `-v` để xóa cả dữ liệu).

## Phát triển (chạy app trên máy)

Cần Node.js ≥ 20, pnpm 9 (`npm i -g pnpm@9`) và Docker Desktop đang chạy.

Trên Windows: mở Docker Desktop rồi chạy `start.bat` (hoặc `start.bat seed` để nạp lại dữ liệu demo). Script tự tạo `.env` với JWT secret ngẫu nhiên nếu chưa có, cài dependency, bật Postgres/Redis, áp migration, build image sandbox nếu thiếu, rồi chạy `pnpm dev` và mở trình duyệt.

Làm tay từng bước:

```bash
cp .env.example .env          # rồi điền JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
pnpm install                  # tự chạy prisma generate
pnpm db:up                    # Postgres (cổng 5433) + Redis (6379)
pnpm db:migrate               # áp migration
pnpm db:seed                  # 5 tài khoản demo, 15 bài, 1 lớp + 1 assignment
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
| `docker/compose` | Compose cho dev (chỉ Postgres + Redis) |
| `docker/app` | Dockerfile production (api/worker/web) + nginx; dùng bởi `docker-compose.yml` |
| `docs` | Báo cáo, phân công, kịch bản demo |
| `docker/sandbox` | Image chấm bài: `pnpm build:sandbox` |
| `seed` | Dữ liệu demo |

## Lệnh hữu ích

| Lệnh | Việc |
|---|---|
| `pnpm typecheck` | Kiểm tra kiểu toàn bộ workspace |
| `pnpm test` | Chạy Vitest (test API dùng DB riêng `judgehint_test` + Redis DB 1, tự migrate) |
| `pnpm test:e2e` | Chạy Playwright e2e (xem bên dưới) |
| `pnpm db:studio` | Mở Prisma Studio |
| `pnpm db:reset` | Xóa sạch DB, migrate lại và seed |
| `pnpm db:down` | Tắt Postgres/Redis |

## Test e2e (Playwright)

Ba luồng chính trong `e2e/tests`: nộp bài đúng → thấy tiến độ trực tiếp rồi "Chấp nhận"; nộp sai → mở gợi ý AI mức 1 (streaming), mức 2 chỉ mở sau mức 1; hai trình duyệt cùng assignment → bảng xếp hạng cập nhật khi có người AC.

```bash
pnpm db:up && pnpm build:sandbox                  # cần Docker đang chạy
pnpm --filter @judgehint/e2e install-browsers     # lần đầu: tải Chromium
pnpm test:e2e
```

- Playwright tự khởi động api (:4100), judge-worker, web (:5174) và một server LLM giả tương thích OpenAI (:4199), nên chạy song song được với `pnpm dev` và không gọi 9router.
- Dữ liệu riêng: DB `judgehint_e2e` + Redis DB 2, được xóa và seed lại trước mỗi lần chạy.
- Muốn giữ stack chạy sẵn giữa các lần test: `pnpm e2e:stack` ở một terminal khác. Log dịch vụ ghi vào `e2e/stack.log` (`E2E_VERBOSE=1` để in ra màn hình).
