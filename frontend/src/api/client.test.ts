/** Transport checks distinguish safe response parsing from silent session/CSRF failure. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { signIn, signOut } from './auth';
import { ApiError, clearCsrfToken, request } from './client';

const identity = { id: 1, username: 'planner', role: 'Planner' };

beforeEach(() => clearCsrfToken());

describe('API transport', () => {
  it('leaves multipart boundaries to the browser and still sends CSRF', async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url.endsWith('/csrf/')) return Response.json({ csrf_token: 'masked' });
        calls.push(options!);
        return new Response(null, { status: 204 });
      }),
    );
    const body = new FormData();
    body.append('data', JSON.stringify({ title: 'Example' }));
    body.append('sheet_music_pdf', new File(['%PDF-1.4\n%%EOF'], 'score.pdf'));
    await request('/hymns/', z.undefined(), { method: 'POST', body });
    expect(new Headers(calls[0].headers).has('Content-Type')).toBe(false);
    expect(new Headers(calls[0].headers).get('X-CSRFToken')).toBe('masked');
    expect(calls[0].body).toBe(body);
  });
  it('rebootstraps after login rotation before logout and sends same-origin credentials', async () => {
    const calls: { url: string; options?: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: RequestInit) => {
        calls.push({ url, options });
        if (url.endsWith('/csrf/')) return Response.json({ csrf_token: `masked-${calls.length}` });
        if (url.endsWith('/login/')) return Response.json(identity);
        return new Response(null, { status: 204 });
      }),
    );
    await signIn('planner', 'a password');
    await signOut();
    expect(calls.map((call) => call.url)).toEqual([
      '/api/v1/auth/csrf/',
      '/api/v1/auth/login/',
      '/api/v1/auth/csrf/',
      '/api/v1/auth/logout/',
    ]);
    expect(new Headers(calls[1].options?.headers).get('X-CSRFToken')).toBe('masked-1');
    expect(new Headers(calls[3].options?.headers).get('X-CSRFToken')).toBe('masked-3');
    expect(calls[1].options?.credentials).toBe('same-origin');
  });

  it('preserves the distinction between expiry and permission denial', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { detail: 'Denied', code: 'permission_denied', errors: {} },
            { status: 403 },
          ),
        ),
    );
    await expect(request('/auth/me/', z.unknown())).rejects.toMatchObject({
      code: 'permission_denied',
      status: 403,
    });
  });

  it('rejects malformed success and proxy HTML responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ wrong: true }))
        .mockResolvedValueOnce(new Response('<html>failure</html>', { status: 502 })),
    );
    await expect(request('/auth/me/', z.object({ id: z.number() }))).rejects.toMatchObject({
      code: 'invalid_response',
    });
    await expect(request('/auth/me/', z.unknown())).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('turns network failures into a retryable error without exposing raw exceptions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private internal failure')));
    await expect(request('/auth/me/', z.unknown())).rejects.toBeInstanceOf(ApiError);
    await expect(request('/auth/me/', z.unknown())).rejects.toMatchObject({
      code: 'network_error',
      status: 0,
    });
  });
});
