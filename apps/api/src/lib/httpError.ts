/** Error carrying an HTTP status and a stable code; `message` is shown to users (Vietnamese). */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static badRequest(message = 'Yêu cầu không hợp lệ', details?: unknown) {
    return new HttpError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Bạn cần đăng nhập') {
    return new HttpError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'Bạn không có quyền thực hiện thao tác này') {
    return new HttpError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Không tìm thấy tài nguyên') {
    return new HttpError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string) {
    return new HttpError(409, 'CONFLICT', message);
  }
  static tooManyRequests(message = 'Bạn thao tác quá nhanh, vui lòng thử lại sau') {
    return new HttpError(429, 'TOO_MANY_REQUESTS', message);
  }
}
