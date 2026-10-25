/** Session operations; login rotation always invalidates the previous CSRF token. */
import { z } from 'zod';

import { clearCsrfToken, request } from './client';

export const userSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1),
  role: z.enum(['Admin', 'Planner', 'Viewer']),
  email: z.string().nullable().optional(),
  email_verified: z.boolean().optional(),
  verification_required: z.boolean().optional(),
  can_create_choirs: z.boolean().optional(),
  can_edit_hymns: z.boolean().optional(),
});
export type User = z.infer<typeof userSchema>;
export const fetchAuthConfig = () =>
  request(
    '/auth/config/',
    z.object({
      registration_enabled: z.boolean(),
      email_verification_enabled: z.boolean().optional().default(true),
      password_reset_enabled: z.boolean().optional().default(true),
    }),
  );
export async function registerAccount(data: {
  username: string;
  email: string;
  password: string;
  password_confirmation: string;
}) {
  const user = await request('/auth/register/', userSchema, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  clearCsrfToken();
  return user;
}
export const setEmail = (email: string) =>
  request('/auth/email/', userSchema, { method: 'POST', body: JSON.stringify({ email }) });
export async function verifyEmail(token: string) {
  const user = await request('/auth/verify-email/', userSchema, {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  clearCsrfToken();
  return user;
}
const message = z.object({ detail: z.string() });
export const setChoirCreationPermission = (username: string, can_create_choirs: boolean) =>
  request('/auth/choir-creation/', message, {
    method: 'POST',
    body: JSON.stringify({ username, can_create_choirs }),
  });
export const resendVerification = () =>
  request('/auth/resend-verification/', message, { method: 'POST', body: '{}' });
export const requestReset = (email: string) =>
  request('/auth/password-reset/request/', message, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
export const resetPassword = (token: string, password: string) =>
  request('/auth/password-reset/confirm/', message, {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
export const changePassword = (current_password: string, password: string) =>
  request('/auth/password/', message, {
    method: 'POST',
    body: JSON.stringify({ current_password, password }),
  });

export function currentUser(): Promise<User> {
  return request('/auth/me/', userSchema);
}

/** The next unsafe action bootstraps again after Django rotates login's cookie. */
export async function signIn(username: string, password: string): Promise<User> {
  const user = await request('/auth/login/', userSchema, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  clearCsrfToken();
  return user;
}

export async function signOut(): Promise<void> {
  await request('/auth/logout/', z.undefined(), { method: 'POST', body: '{}' });
  clearCsrfToken();
}
