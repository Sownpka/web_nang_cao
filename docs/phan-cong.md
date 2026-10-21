# Bảng phân công — JudgeHint

**Nhóm:** [Tên nhóm] · **Học phần:** Lập trình Web nâng cao · **Repo:** [link GitHub] (tag `final`)

> Điền họ tên, MSSV, % đóng góp (tổng = 100%) rồi in ra để cả nhóm ký. Giảng viên đối chiếu bảng này với
> lịch sử commit và phiếu đánh giá chéo, nên mỗi người cần commit phần mình bằng tài khoản GitHub của mình.
> Phần "Phụ trách" bên dưới là gợi ý theo CLAUDE.md — sửa cho đúng thực tế. Hỏi đáp cá nhân hỏi chủ yếu về phần mỗi người khai ở đây.

| # | Họ tên | MSSV | Phụ trách | Thư mục / file chính | Trình bày phần | % đóng góp |
|---|---|---|---|---|---|---|
| 1 | | | Sandbox Docker, judge-worker, hàng đợi BullMQ, test bảo mật sandbox, hỗ trợ C++ | `apps/judge-worker/**`, `docker/sandbox/**` | Kỹ thuật nổi bật: sandbox | |
| 2 | | | API Express, xác thực JWT/refresh, RBAC, Prisma schema + migration, Socket.IO, bảng xếp hạng, Docker Compose, CI | `apps/api/src/{modules,middleware,realtime}/**`, `prisma/**`, `docker-compose.yml`, `.github/workflows/**` | Kiến trúc + Chất lượng (test/CI/bảo mật) | |
| 3 | | | Frontend React: trang làm bài (Monaco, tiến độ real-time), danh sách/lịch sử, bảng xếp hạng, trang giảng viên, hồ sơ + biểu đồ | `apps/web/**` | Bài toán + Demo trực tiếp | |
| 4 | | | AI gợi ý: prompt 3 mức, SSE, leak guard, hạn mức/cache, trừ điểm; e2e Playwright; báo cáo | `apps/api/src/ai/**`, `apps/api/src/modules/hints/**`, `e2e/**`, `docs/**` | Kỹ thuật nổi bật: AI + Hạn chế | |
| | | | | | **Tổng** | **100%** |

## Xác nhận của các thành viên

Chúng tôi xác nhận bảng phân công và tỉ lệ đóng góp trên là đúng.

| Thành viên | Chữ ký | Ngày |
|---|---|---|
| 1. | | |
| 2. | | |
| 3. | | |
| 4. | | |
