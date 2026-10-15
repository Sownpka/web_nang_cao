// Vietnamese UI strings. Keep user-facing text here rather than inline in components.
export const vi = {
  appName: 'JudgeHint',
  tagline: 'Chấm bài lập trình tự động, gợi ý lỗi bằng AI',
  nav: {
    problems: 'Bài tập',
    submissions: 'Lịch sử nộp',
    leaderboard: 'Xếp hạng',
    login: 'Đăng nhập',
  },
  theme: {
    toggle: 'Đổi giao diện sáng/tối',
  },
  home: {
    heading: 'Luyện code, nhận gợi ý đúng lúc',
    intro:
      'Viết code ngay trên trình duyệt, hệ thống chấm trong sandbox an toàn. Khi sai, AI giải thích lỗi theo từng mức — không bao giờ đưa lời giải.',
    systemStatus: 'Trạng thái hệ thống',
    statusOk: 'Hoạt động',
    statusDown: 'Mất kết nối',
    statusChecking: 'Đang kiểm tra…',
    apiUnreachable: 'Không kết nối được API',
    database: 'Cơ sở dữ liệu',
    cache: 'Redis',
    api: 'API',
  },
  notFound: {
    title: 'Không tìm thấy trang',
    back: 'Về trang chủ',
  },
} as const;
