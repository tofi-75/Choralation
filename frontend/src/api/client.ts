/**
 * Typed same-origin transport. Tokens stay in memory, never localStorage.
 * Distinguish expiry, permission, CSRF, malformed server responses, and network
 * failure. Unsafe requests require a freshly bootstrapped masked CSRF token.
 */
import { z } from 'zod';

const errorSchema = z.object({
  detail: z.string(),
  code: z.string(),
  errors: z.record(z.string(), z.unknown()),
});

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly fields: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let csrfToken: string | null = null;

/** Reset on login/logout so a rotated or previous session token is never reused. */
export function clearCsrfToken(): void {
  csrfToken = null;
}

/** Fetch a masked token; the associated HTTP-only cookie is managed by the browser. */
export async function bootstrapCsrf(): Promise<void> {
  const token = await request('/auth/csrf/', z.object({ csrf_token: z.string().min(1) }));
  csrfToken = token.csrf_token;
}

/** Validate each successful response with its domain schema; do not cast untrusted JSON. */
export async function request<T>(
  resource: string,
  schema: z.ZodType<T>,
  options: RequestInit = {},
): Promise<T> {
  if (!resource.startsWith('/') || resource.startsWith('//')) {
    throw new ApiError('Invalid API resource.', 'client_error', 0);
  }
  const method = options.method?.toUpperCase() ?? 'GET';
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (unsafe && !csrfToken) await bootstrapCsrf();
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  // Browser supplies the multipart boundary for private PDF uploads.
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  if (unsafe && csrfToken) headers.set('X-CSRFToken', csrfToken);
  let response: Response;
  try {
    response = await fetch(`/api/v1${resource}`, {
      ...options,
      headers,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(
      'Unable to connect. Check your connection and try again.',
      'network_error',
      0,
    );
  }
  let body: unknown;
  try {
    body = response.status === 204 ? undefined : await response.json();
  } catch {
    throw new ApiError(
      'The server returned an unreadable response. Try again.',
      'invalid_response',
      response.status,
    );
  }
  if (!response.ok) {
    const parsed = errorSchema.safeParse(body);
    if (parsed.success) {
      if (parsed.data.code === 'csrf_failed') clearCsrfToken();
      throw new ApiError(parsed.data.detail, parsed.data.code, response.status, parsed.data.errors);
    }
    throw new ApiError('The request failed. Please try again.', 'request_failed', response.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      'The server response could not be verified. Try again.',
      'invalid_response',
      response.status,
    );
  }
  return parsed.data;
}
