# Kịch bản trình bày, demo và hỏi đáp — JudgeHint

Bài trình bày tối đa 15 phút (hướng dẫn: 10 phút trình bày + demo, sau đó hỏi đáp). Mọi thành viên phải nói ít nhất một phần.
Slide (12 slide, có ghi chú người nói): https://claude.ai/artifact/CxofLcCj65fDKHsz3wh1VG — tải về dạng PPTX/PDF từ menu Share › Export để trình chiếu offline. Tên người nói lấy theo [phan-cong.md](phan-cong.md).

## 1. Phân bổ thời gian

| Phần | Thời gian | Người nói | Slide | Nói gì |
|---|---|---|---|---|
| Bài toán và người dùng | 1′ | TV3 | 1–2 | Chấm tay chậm, AI thường lộ lời giải → chấm tự động + gợi ý 3 mức không lộ code. 3 vai trò, 5 tiêu chí "xong". |
| Kiến trúc | 2′ | TV2 | 3–4 | Sơ đồ: web → api → Postgres/Redis → worker → sandbox. Vì sao tách worker qua hàng đợi, Socket.IO vs SSE, JWT + refresh cookie. |
| Demo trực tiếp | 2′ | TV3 | 5 | Theo kịch bản mục 2, trên bản deploy. |
| Kỹ thuật nổi bật | 2′ | TV1 + TV4 | 6–8 | TV1: cấu hình container khóa chặt + 6 test code độc. TV4: leak guard + luồng SSE 2 pha. |
| Chất lượng | 2′ | TV2 | 9–10 | 215 test Vitest + 3 e2e, CI 3 job, các biện pháp bảo mật, số liệu chấm p95 < 4,1 s. |
| Hạn chế, hướng phát triển | 1′ | TV4 | 11–12 | Nút thắt worker, Docker socket, đánh giá AI định tính. |

## 2. Kịch bản demo trực tiếp (2 phút)

Chuẩn bị trước: 2 cửa sổ trình duyệt (một cửa sổ ẩn danh), đã đăng nhập sẵn `sv1` và `sv2` ở trang assignment "Bài tập tuần 1"; zoom trình duyệt 125% cho cuối phòng đọc được.

1. **Trường hợp lỗi — chưa đăng nhập (10 s):** mở tab mới vào `/problems` khi chưa đăng nhập → bị chuyển về trang đăng nhập. Đăng nhập sai mật khẩu → thông báo lỗi tiếng Việt.
2. **Nộp sai (25 s):** `sv1` mở bài "Tổng hai số", dán code chỉ đọc 1 số → *Nộp bài* → thanh tiến độ chạy từng test trực tiếp → "Sai kết quả", thấy input/expected/actual của test công khai.
3. **Gợi ý AI (30 s):** mở mức 1 → chữ hiện dần; mức 2 đang khóa cho tới khi mở mức 1; chỉ ra dòng "−10% điểm". Nhấn mạnh: không có dòng code lời giải nào.
4. **Nộp đúng + bảng xếp hạng (30 s):** sửa code, nộp → "Chấp nhận". Cửa sổ `sv2` đang mở bảng xếp hạng → `sv1` nhảy hạng ngay, không tải lại trang.
5. **Trường hợp lỗi — không đủ quyền (15 s):** `sv1` gõ `/teacher/problems` → trang "Không có quyền". (Nếu còn giờ: code `while True: pass` → "Quá thời gian", server vẫn chạy bình thường.)

Nếu mạng/server gặp sự cố: chuyển ngay sang video dự phòng (đã tải về máy, mở được không cần mạng).

## 3. Kịch bản video dự phòng (3–5 phút)

Quay màn hình 1080p (OBS hoặc Xbox Game Bar `Win + Alt + R`), có lồng tiếng hoặc phụ đề:

1. (0:00) Trang chủ bản deploy, ô "Trạng thái hệ thống" xanh.
2. (0:20) Đăng ký tài khoản sinh viên mới bằng mã SV, tham gia lớp bằng mã `WEB2026`.
3. (0:50) Mở bài, *Chạy thử* với test công khai; *Nộp* code sai → tiến độ trực tiếp → Sai kết quả.
4. (1:30) Mở gợi ý mức 1 → mức 2 (streaming).
5. (2:10) Sửa và nộp lại → Chấp nhận; cửa sổ thứ hai thấy bảng xếp hạng đổi hạng.
6. (2:50) Nộp code độc (`while True: pass`, fork bomb) → TLE / RE, trang vẫn hoạt động.
7. (3:20) Đăng nhập giảng viên: tạo bài, nhập test từ file `.zip`, xem báo cáo lớp và xuất CSV.
8. (4:10) Sinh viên vào trang giảng viên → bị chặn. Kết thúc ở trang CI xanh trên GitHub.

## 4. Chuẩn bị hỏi đáp (mỗi người tự đọc lại phần mình)

Giảng viên có thể chọn ngẫu nhiên một đoạn code để giải thích, hỏi lý do thiết kế, tình huống mở rộng, hoặc yêu cầu sửa nhỏ trong 3 phút.

**TV1 — sandbox/worker** (`apps/judge-worker/src/runner/dockerRunner.ts`, `judge.ts`)
- Vì sao mỗi test một container mới? → không còn trạng thái từ lần chạy trước (file tmp, tiến trình con); đổi lại tốn ~0,4 s/test.
- Fork bomb bị chặn bởi gì? → `PidsLimit: 64`. Gọi mạng? → `NetworkMode: 'none'`. Ghi file lớn? → rootfs read-only + tmpfs 16MB + `ulimit fsize` 1MB.
- Phân biệt TLE với treo: CPU time từ cgroup so với `timeLimitMs`, cộng bộ hẹn giờ thời gian thực 2× + 1 s để kill.
- Worker sập giữa chừng thì sao? → job BullMQ được thử lại; container mồ côi có nhãn deadline và bị dọn khi worker khởi động.
- Sửa nhỏ có thể gặp: đổi `PidsLimit`, thêm một ngôn ngữ trong `languages.ts`, thêm một test vào `sandbox.test.ts`.

**TV2 — API/realtime** (`apps/api/src/modules/auth/*`, `middleware/*`, `realtime/*`)
- Vì sao refresh token ở cookie httpOnly mà access token ở bộ nhớ? → XSS không đọc được cookie httpOnly; access token sống 15 phút nên lộ cũng ít hại; `SameSite=Strict` chống CSRF.
- Phát hiện refresh token bị đánh cắp: token đã bị xoay vòng mà được dùng lại sau thời gian ân hạn → thu hồi mọi phiên.
- Số người dùng tăng 10×: nút thắt là worker → chạy thêm worker cùng đọc queue; API stateless có thể nhân bản (Socket.IO cần Redis adapter).
- Redis sập thì sao? → không nộp bài được (queue), không có real-time, rate limit lỗi; dữ liệu vẫn nằm trong Postgres.
- Sửa nhỏ có thể gặp: thêm trường vào `User` (schema Prisma + migration + Zod), thêm validation trong `packages/shared/src/schemas.ts`, thêm test Supertest.

**TV3 — frontend** (`apps/web/src/pages/ProblemDetailPage.tsx`, `features/*`, `lib/api.ts`)
- State được quản lý thế nào? → dữ liệu server qua TanStack Query (cache, invalidate khi có sự kiện socket); state UI cục bộ bằng `useState`; phiên đăng nhập trong `AuthProvider` (Context).
- Tự refresh token: `lib/api.ts` gặp 401 thì gọi `/auth/refresh` một lần rồi gửi lại request.
- Tiến độ chấm cập nhật thế nào? → `SocketProvider` nghe `submission:progress`/`done` và cập nhật cache query.
- Sửa nhỏ có thể gặp: thêm cột vào bảng danh sách bài, thêm validation form đăng ký.

**TV4 — AI** (`apps/api/src/ai/leak-guard.ts`, `prompts.ts`, `modules/hints/*`)
- Vì sao cần leak guard khi đã có prompt? → mô hình thật vẫn vi phạm (3/20 câu trả lời đầu bị chặn trong thử nghiệm).
- Chống prompt injection trong code sinh viên: dữ liệu bọc trong `<<<BEGIN …>>>`/`<<<END …>>>`, prompt dặn coi là dữ liệu; leak guard vẫn chặn đầu ra.
- Vì sao không stream thẳng token từ LLM? → phải kiểm tra câu trả lời hoàn chỉnh trước khi sinh viên thấy; SSE gửi `status` rồi mới gửi `delta` đã duyệt.
- Test ẩn có lộ cho LLM không? → không, chỉ gửi "sai ở test ẩn số N".
- 9router sập: báo lỗi "Không tạo được gợi ý" và không trừ lượt; có thể thêm gợi ý mặc định.

## 5. Checklist trước buổi báo cáo (theo hướng dẫn)

- [ ] Clone repo sạch về máy khác, chạy `docker compose up --build` theo README thành công
- [ ] Link deploy mở được, tài khoản demo đăng nhập được (đã đổi `SEED_DEMO_PASSWORD`)
- [ ] Dữ liệu mẫu đã seed sẵn
- [ ] Video dự phòng đã tải về máy, mở được khi không có mạng
- [ ] Đã tập thử, tổng thời gian dưới 15 phút
- [ ] Mỗi thành viên đã đọc lại phần code mình phụ trách
- [ ] Báo cáo PDF và bảng phân công đã nộp đủ chữ ký
- [ ] Mang laptop, dây HDMI/adapter
