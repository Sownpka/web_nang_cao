import { z } from 'zod';
import type { Role } from './enums.js';

export const PASSWORD_MIN = 8;
export const STUDENT_CODE_REGEX = /^\d{8}$/;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Vui lòng nhập email')
  .email('Email không hợp lệ')
  .max(254);

const password = z
  .string()
  .min(PASSWORD_MIN, `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự`)
  .max(72, 'Mật khẩu tối đa 72 ký tự'); // bcrypt only uses the first 72 bytes

/** Self-registration is for students only; teachers/admins are created by an admin. */
export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Họ tên quá ngắn').max(100, 'Họ tên quá dài'),
  studentCode: z.string().trim().regex(STUDENT_CODE_REGEX, 'Mã sinh viên gồm 8 chữ số'),
  email,
  password,
});
export type RegisterInput = z.infer<typeof registerSchema>;

/** `identifier` is either an email or an 8-digit student code. */
export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Vui lòng nhập email hoặc mã sinh viên').max(254),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu').max(72),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  studentCode: string | null;
  role: Role;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}
