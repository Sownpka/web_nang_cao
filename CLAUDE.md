# CLAUDE.md — JudgeHint: Hệ thống chấm bài lập trình tự động + AI gợi ý lỗi

> Đồ án môn **Thiết kế/Xây dựng Web nâng cao** — Phenikaa University.
> Tên dự án tạm: **JudgeHint** (đổi tên thì thay toàn bộ trong file này).
> Claude Code đảm nhận cả backend lẫn frontend. Viết code, comment và commit message bằng tiếng Anh; giao diện người dùng bằng tiếng Việt.

---

## 1. Mục tiêu sản phẩm

Web kiểu LeetCode thu nhỏ cho lớp học:

- Giảng viên tạo bài tập (đề, test case công khai + ẩn, giới hạn thời gian/RAM, deadline).
- Sinh viên viết code ngay trên web, nộp bài, hệ thống chạy code trong **sandbox Docker** và chấm tự động.
- Khi sai, **AI giải thích lỗi theo từng mức gợi ý** — tuyệt đối không đưa code lời giải.
- Trạng thái chấm và bảng xếp hạng cập nhật **real-time**.

### Tiêu chí "xong" cho buổi bảo vệ
1. Sinh viên nộp code Python/JS → nhận kết quả trong < 10 giây, trạng thái đổi trực tiếp không cần reload.
2. Code độc (vòng lặp vô hạn, fork bomb, gọi mạng, ghi file hệ thống) bị chặn, server không sập.
3. AI gợi ý 3 mức, streaming từng chữ, không lộ lời giải (có bước kiểm tra rò rỉ).
4. Bảng xếp hạng nhảy hạng trực tiếp khi có người AC.
5. Phân quyền đúng: sinh viên không xem được test ẩn, không sửa bài của giảng viên.

---

## 2. Tech stack

| Lớp | Công nghệ | Ghi chú |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | TailwindCSS, shadcn/ui, TanStack Query, React Router |
| Code editor | Monaco Editor (`@monaco-editor/react`) | |
| Backend API | Node.js 20 + Express + TypeScript | Zod để validate input |
| Real-time | Socket.IO | Room theo `user:{id}`, `assignment:{id}` |
| AI streaming | Server-Sent Events (SSE) | |
| Database | PostgreSQL 16 + Prisma ORM | |
| Hàng đợi | Redis 7 + BullMQ | Queue `submissions`, `hints` |
| Judge worker | Node.js + `dockerode` | Process riêng, không chạy chung với API |
| Sandbox | Docker container khóa chặt (xem mục 5) | |
| AI | Gọi qua **9router** (proxy AI tự host trên home server) | Giả định API tương thích OpenAI — **cần xác nhận trước khi code mục 6** |
| Auth | JWT (access 15 phút + refresh token httpOnly cookie), bcrypt | |
| Deploy | Docker Compose trên home server, Cloudflare Tunnel | Subdomain gợi ý: `judge.hxnos.com` |

Không tự ý đổi stack. Nếu thấy cần đổi, hỏi trước.

---

## 3. Kiến trúc

```
[Browser]
   │  REST (/api)  ·  Socket.IO  ·  SSE (/api/hints/stream)
   ▼
[api]  Express ──► PostgreSQL
   │      │
   │      └──► Redis (BullMQ queue "submissions")
   │                    │
   │                    ▼
   │              [judge-worker] ──► Docker daemon ──► sandbox containers (1 lần chạy = 1 container)
   │                    │
   │      ◄── Redis pub/sub "judge-events" (worker báo tiến độ)
   │
   └──► 9router (LLM) cho gợi ý
```

- API **không bao giờ** chạy code người dùng. Chỉ worker được nói chuyện với Docker daemon.
- Worker publish sự kiện qua Redis pub/sub → API nhận và emit Socket.IO tới đúng room.
- Worker concurrency mặc định **2** (máy i7-3770, 16GB RAM). Cấu hình qua env `JUDGE_CONCURRENCY`.

---

## 4. Cấu trúc thư mục (monorepo, pnpm workspaces)

```
judgehint/
├── apps/
│   ├── web/                 # React + Vite
│   │   └── src/
│   │       ├── pages/       # Login, Problems, ProblemDetail, Submissions, Leaderboard, Admin/*
│   │       ├── components/
│   │       ├── features/    # auth, problems, submissions, hints, leaderboard
│   │       ├── lib/         # api client, socket, sse
│   │       └── i18n/vi.ts
│   ├── api/                 # Express
│   │   └── src/
│   │       ├── modules/     # auth, users, problems, testcases, submissions, hints, leaderboard, assignments
│   │       ├── middleware/  # auth, rbac, rateLimit, errorHandler
│   │       ├── realtime/    # socket.io setup, redis subscriber
│   │       ├── ai/          # llm client, prompts, leak-guard
│   │       └── index.ts
│   └── judge-worker/
│       └── src/
│           ├── runner/      # dockerRunner.ts, languages.ts
│           ├── compare.ts   # so sánh output
│           └── index.ts
├── packages/
│   └── shared/              # types, zod schemas, enums dùng chung (Verdict, Role, Language)
├── prisma/schema.prisma
├── docker/
│   ├── sandbox/             # Dockerfile cho từng ngôn ngữ chấm
│   └── compose/             # docker-compose.yml, docker-compose.dev.yml
├── seed/                    # bài mẫu + test case để demo
└── CLAUDE.md
```

---

## 5. Sandbox chấm bài (phần quan trọng nhất)

### Ngôn ngữ
| Language | Image | Compile | Run |
|---|---|---|---|
| `python` | `judgehint/py:3.12` (từ python:3.12-alpine) | — | `python3 main.py` |
| `javascript` | `judgehint/node:20` (từ node:20-alpine) | — | `node main.js` |
| `cpp` (giai đoạn sau) | `judgehint/gcc:13` | `g++ -O2 -std=c++17 main.cpp -o main` | `./main` |

### Giới hạn bắt buộc cho mỗi container
```
--network none
--memory <memoryLimitMb>m --memory-swap <memoryLimitMb>m
--cpus 0.5
--pids-limit 64
--read-only
--tmpfs /tmp:rw,size=16m,noexec (riêng C++ cần exec trong thư mục build)
--user 65534:65534            # nobody
--cap-drop ALL
--security-opt no-new-privileges
--ulimit fsize=1048576        # tối đa 1MB file ghi ra
không mount docker.sock, không mount thư mục host nào ngoài thư mục code tạm (read-only)
```

### Quy trình chấm một submission
1. Tạo thư mục tạm, ghi file code.
2. (C++) compile trong container riêng, timeout 10s → lỗi thì `COMPILE_ERROR`.
3. Với **mỗi test case** (theo thứ tự, dừng ở test sai đầu tiên):
   - Chạy container, đưa input qua stdin, đo thời gian thực.
   - Quá `timeLimitMs` → kill container → `TIME_LIMIT_EXCEEDED`.
   - Container bị OOM kill → `MEMORY_LIMIT_EXCEEDED`.
   - Exit code ≠ 0 → `RUNTIME_ERROR` (lưu 2KB cuối của stderr).
   - Output khác expected → `WRONG_ANSWER`.
   - Publish tiến độ: `{ submissionId, testIndex, total, status }`.
4. Qua hết → `ACCEPTED`. Lưu runtime lớn nhất, memory lớn nhất.
5. Luôn xóa container và thư mục tạm (kể cả khi lỗi) — dùng `finally`.

### So sánh output
- Chuẩn hóa: bỏ khoảng trắng cuối mỗi dòng, bỏ dòng trống cuối file, `\r\n` → `\n`.
- Cắt stdout ở 64KB để tránh tràn.

### Bắt buộc phải có test cho sandbox (`judge-worker/test/`)
`while True: pass`, fork bomb, `import socket` gọi ra ngoài, ghi file 100MB, cấp phát 1GB RAM, đọc `/etc/passwd` rồi in ra. Tất cả phải ra verdict đúng và worker không chết.

---

## 6. AI gợi ý lỗi

### Khi nào được gợi ý
- Chỉ với submission của chính mình có verdict ≠ `ACCEPTED` và ≠ `COMPILE_ERROR` thì vẫn được (giải thích lỗi biên dịch cũng hữu ích).
- 3 mức, phải mở lần lượt:
  - **Mức 1 — Hướng nghĩ:** lỗi thuộc loại gì (biên, logic, độ phức tạp, đọc input...), không chỉ vị trí.
  - **Mức 2 — Khoanh vùng:** chỉ ra đoạn/hàm nghi ngờ và trường hợp đầu vào khiến sai (dùng test công khai, **không lộ test ẩn**).
  - **Mức 3 — Chỉ dòng:** nêu dòng nghi ngờ và vì sao sai, vẫn không viết code sửa.
- Mỗi mức đã mở bị trừ điểm (xem mục 8). Giảng viên có thể tắt AI cho từng bài.

### Input gửi cho LLM
Đề bài, ngôn ngữ, code của sinh viên, verdict, test công khai bị sai (input/expected/actual) hoặc thông báo "sai ở test ẩn số N" (không gửi nội dung test ẩn), stderr đã cắt, mức gợi ý, các gợi ý đã đưa trước đó.

### System prompt (đặt ở `apps/api/src/ai/prompts.ts`)
Yêu cầu chính:
- Trả lời tiếng Việt, ngắn gọn, giọng thầy hướng dẫn.
- **Không viết code lời giải, không viết lại hàm, không đưa pseudo-code đầy đủ.** Được trích tối đa 1 dòng code của chính sinh viên để chỉ chỗ.
- Bám đúng mức gợi ý được yêu cầu, không vượt mức.
- Không bịa nội dung test ẩn.

### Leak guard (`apps/api/src/ai/leak-guard.ts`)
Sau khi có câu trả lời đầy đủ:
1. Heuristic: chặn nếu có code block > 2 dòng, hoặc có dòng giống code mà không xuất hiện trong code sinh viên.
2. Nếu bài có `referenceSolution`: so độ tương đồng token với lời giải mẫu, vượt ngưỡng → chặn.
3. Bị chặn → gọi lại LLM 1 lần với nhắc nhở mạnh hơn; vẫn bị chặn → trả gợi ý mặc định của mức đó.

Vì có leak guard, luồng SSE làm như sau: stream từng chunk ra client nhưng **ẩn sau lớp "đang kiểm tra"**; nếu guard chặn thì gửi event `replace` với nội dung thay thế. (Đơn giản hơn nếu cần: sinh xong, kiểm tra, rồi mới stream giả lập từng đoạn.)

### Giới hạn chi phí
- Rate limit: 20 lần gợi ý/sinh viên/ngày (env `HINT_DAILY_LIMIT`).
- Cache theo `(submissionId, level)` — mở lại không gọi LLM lần nữa.
- Model và base URL cấu hình qua env: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`.

---

## 7. Mô hình dữ liệu (Prisma, rút gọn)

```prisma
enum Role { STUDENT TEACHER ADMIN }
enum Language { python javascript cpp }
enum Verdict { PENDING RUNNING ACCEPTED WRONG_ANSWER TIME_LIMIT_EXCEEDED MEMORY_LIMIT_EXCEEDED RUNTIME_ERROR COMPILE_ERROR SYSTEM_ERROR }
enum Difficulty { EASY MEDIUM HARD }

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  fullName     String
  studentCode  String?  @unique
  role         Role     @default(STUDENT)
  createdAt    DateTime @default(now())
  enrollments  Enrollment[]
  submissions  Submission[]
}

model Classroom {          // lớp học phần
  id          String @id @default(cuid())
  name        String
  joinCode    String @unique
  teacherId   String
  enrollments Enrollment[]
  assignments Assignment[]
}

model Enrollment {
  userId      String
  classroomId String
  @@id([userId, classroomId])
}

model Problem {
  id                String     @id @default(cuid())
  slug              String     @unique
  title             String
  statementMd       String     // đề bài markdown
  difficulty        Difficulty
  timeLimitMs       Int        @default(2000)
  memoryLimitMb     Int        @default(256)
  allowedLanguages  Language[]
  aiHintsEnabled    Boolean    @default(true)
  referenceSolution String?    // chỉ giảng viên xem, dùng cho leak guard
  authorId          String
  testCases         TestCase[]
}

model TestCase {
  id        String  @id @default(cuid())
  problemId String
  order     Int
  input     String
  expected  String
  isHidden  Boolean @default(true)
}

model Assignment {          // bộ bài giao cho lớp, có deadline → có bảng xếp hạng riêng
  id          String   @id @default(cuid())
  classroomId String
  title       String
  startsAt    DateTime
  endsAt      DateTime
  problems    AssignmentProblem[]
}

model AssignmentProblem {
  assignmentId String
  problemId    String
  points       Int @default(100)
  @@id([assignmentId, problemId])
}

model Submission {
  id           String   @id @default(cuid())
  userId       String
  problemId    String
  assignmentId String?
  language     Language
  code         String
  verdict      Verdict  @default(PENDING)
  passedCount  Int      @default(0)
  totalCount   Int      @default(0)
  failedTestId String?
  runtimeMs    Int?
  memoryKb     Int?
  stderr       String?
  createdAt    DateTime @default(now())
  hints        Hint[]
  @@index([userId, problemId])
  @@index([assignmentId, createdAt])
}

model Hint {
  id           String   @id @default(cuid())
  submissionId String
  level        Int      // 1..3
  content      String
  blocked      Boolean  @default(false) // bị leak guard thay thế
  createdAt    DateTime @default(now())
  @@unique([submissionId, level])
}
```

---

## 8. Chấm điểm và bảng xếp hạng

- Điểm một bài trong assignment = `points × (1 − 0.1 × số mức gợi ý đã mở trước lần AC đầu tiên)`, tối thiểu 50% `points`.
- Chỉ tính lần AC đầu tiên trước `endsAt`.
- Xếp hạng: tổng điểm giảm dần → tổng thời gian (từ `startsAt` đến lần AC, cộng 5 phút phạt mỗi lần nộp sai trước đó) tăng dần.
- Tính lại khi có AC mới, lưu cache trong Redis (sorted set `lb:{assignmentId}`), emit `leaderboard:update` tới room `assignment:{id}`.

---

## 9. API (REST, prefix `/api`)

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| POST | /auth/register, /auth/login, /auth/refresh, /auth/logout | public | |
| GET | /me | đăng nhập | |
| GET | /problems | đăng nhập | lọc theo độ khó, tìm theo tên |
| GET | /problems/:slug | đăng nhập | kèm test công khai, **không** kèm test ẩn |
| POST/PUT/DELETE | /problems(/:id) | TEACHER, ADMIN | |
| GET/POST/PUT/DELETE | /problems/:id/testcases | TEACHER, ADMIN | |
| POST | /classrooms, /classrooms/join | TEACHER / STUDENT | |
| GET/POST | /classrooms/:id/assignments | thành viên / TEACHER | |
| POST | /submissions | STUDENT | `{ problemId, assignmentId?, language, code }` → 202 + submissionId |
| GET | /submissions?mine=1&problemId= | đăng nhập | |
| GET | /submissions/:id | chủ sở hữu hoặc TEACHER | |
| POST | /submissions/:id/run-samples | STUDENT | chạy thử với test công khai, không lưu vào bảng điểm |
| GET | /hints/stream?submissionId=&level= | chủ submission | SSE |
| GET | /assignments/:id/leaderboard | thành viên lớp | |
| GET | /teacher/assignments/:id/report | TEACHER | thống kê, xuất CSV |

Rate limit nộp bài: 1 lần / 5 giây / user.

### Socket.IO events
- Client → server: `join:assignment` `{ assignmentId }`
- Server → client: `submission:progress` `{ submissionId, testIndex, total }`, `submission:done` `{ submissionId, verdict, ... }`, `leaderboard:update` `{ assignmentId, rows }`
- Xác thực socket bằng access token khi handshake.

---

## 10. Màn hình frontend

1. **Đăng nhập / đăng ký** (mã sinh viên).
2. **Danh sách bài** — bảng có lọc độ khó, cột "đã giải".
3. **Chi tiết bài** — chia đôi: trái là đề (markdown), phải là Monaco + chọn ngôn ngữ + nút "Chạy thử" / "Nộp". Dưới editor là panel kết quả với thanh tiến độ test chạy real-time. Có panel **Gợi ý AI** với 3 nút mức, mức sau bị khóa đến khi mở mức trước, hiện số điểm sẽ bị trừ.
4. **Lịch sử nộp bài** — xem lại code, verdict, gợi ý đã nhận.
5. **Bảng xếp hạng** — animation khi đổi hạng.
6. **Hồ sơ cá nhân** — biểu đồ số bài giải theo thời gian, tỉ lệ verdict.
7. **Giảng viên** — quản lý lớp, tạo bài (editor markdown có preview), quản lý test case (import file .in/.out hoặc zip), tạo assignment, báo cáo lớp.

Giao diện: hỗ trợ dark mode (mặc định dark cho trang làm bài), responsive (trang làm bài trên điện thoại chuyển editor xuống dưới đề).

---

## 11. Lộ trình (giả định 10 tuần — chỉnh lại theo lịch thực tế của học kỳ)

| Tuần | Việc | Kết quả kiểm tra được |
|---|---|---|
| 1 | Monorepo, Docker Compose dev (Postgres, Redis), Prisma schema, seed | `pnpm dev` chạy được cả 3 app |
| 2 | Auth JWT + refresh, RBAC middleware, trang đăng nhập/đăng ký | Đăng nhập 3 vai trò |
| 3 | CRUD bài + test case, trang danh sách và chi tiết bài, Monaco | Giảng viên tạo bài, sinh viên xem đề |
| 4 | **Judge worker + sandbox Python/JS**, BullMQ, test bảo mật sandbox | Nộp bài ra verdict đúng, 6 test độc qua |
| 5 | Socket.IO: tiến độ chấm real-time, lịch sử nộp bài, chạy thử test công khai | Trạng thái đổi trực tiếp |
| 6 | Kết nối 9router, prompt 3 mức, SSE streaming | Gợi ý hiện dần trên UI |
| 7 | Leak guard, rate limit, cache gợi ý, trừ điểm | Thử ép AI đưa lời giải → bị chặn |
| 8 | Lớp học, assignment, bảng xếp hạng real-time | 2 trình duyệt thấy nhau nhảy hạng |
| 9 | Trang giảng viên (báo cáo, CSV), hồ sơ + biểu đồ, C++ nếu kịp | |
| 10 | Deploy lên home server, seed 10–15 bài demo, viết báo cáo, tập demo | `judge.hxnos.com` chạy ổn |

Làm theo thứ tự, mỗi tuần chạy được end-to-end rồi mới sang tuần sau. Tuần 4 là rủi ro lớn nhất — nếu sandbox tự viết gặp khó quá 1 tuần, chuyển sang Judge0 self-host làm phương án dự phòng.

---

## 12. Biến môi trường (`.env.example`)

```
DATABASE_URL=postgresql://judgehint:judgehint@localhost:5432/judgehint
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
WEB_ORIGIN=http://localhost:5173
LLM_BASE_URL=            # endpoint của 9router
LLM_API_KEY=
LLM_MODEL=
HINT_DAILY_LIMIT=20
JUDGE_CONCURRENCY=2
JUDGE_WORKDIR=/tmp/judgehint
```

---

## 13. Quy ước code

- TypeScript strict ở mọi app. Không dùng `any` trừ khi có comment giải thích.
- Schema Zod và enum đặt trong `packages/shared`, dùng chung cho FE/BE.
- Mỗi module backend: `*.routes.ts`, `*.service.ts`, `*.schema.ts`. Route chỉ validate + gọi service.
- Lỗi trả về dạng `{ error: { code, message } }`, message tiếng Việt cho người dùng.
- Không log code sinh viên ra console ở production.
- Test: Vitest cho service và judge-worker (bắt buộc với sandbox và leak guard), Playwright cho 2–3 luồng chính (nộp bài → AC, mở gợi ý).
- Commit nhỏ, theo Conventional Commits.

## 14. Lệnh thường dùng

```
pnpm install
pnpm dev                       # chạy web + api + worker
pnpm db:migrate                # prisma migrate dev
pnpm db:seed
pnpm test
pnpm build:sandbox             # build các image trong docker/sandbox
docker compose -f docker/compose/docker-compose.yml up -d   # production
```

## 15. Deploy (home server)

- Thêm stack riêng `~/server/judgehint` (không dùng chung MySQL hiện có).
- Container `judge-worker` cần truy cập Docker daemon → mount `/var/run/docker.sock` **chỉ cho worker**, không bao giờ cho api/web. Cân nhắc dùng `docker-socket-proxy` chỉ mở các endpoint containers/images.
- nginx hoặc Cloudflare Tunnel trỏ `judge.hxnos.com` → web (static) và `/api`, `/socket.io` → api. Bật WebSocket và tắt buffering cho đường SSE.

## 16. Việc cần xác nhận trước khi code

- [ ] 9router có endpoint tương thích OpenAI (`/v1/chat/completions`, hỗ trợ `stream: true`) không? Model nào dùng cho gợi ý? có, dùng model tùy
- [ ] Giảng viên có yêu cầu bắt buộc về framework (VD phải dùng Next.js / Spring Boot) không? nên dùng react
- [ ] Làm cá nhân hay nhóm? Nếu nhóm, chia theo: (1) sandbox + worker, (2) API + realtime, (3) frontend, (4) AI. làm nhóm
- [ ] Hạn nộp và ngày bảo vệ để chốt lại lộ trình mục 11. chưa có
