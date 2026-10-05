/** Session operations; login rotation always invalidates the previous CSRF token. */
import { z } from 'zod';

import { clearCsrfToken, request } from './client';

export const userSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1),
  role: z.enum(['Admin', 'Planner', 'Viewer']),
});
export type User = z.infer<typeof userSchema>;

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
