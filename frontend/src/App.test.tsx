/** User-facing auth integration: route protection, validation, retry, and expiry. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import { App } from './App';
import { clearCsrfToken } from './api/client';
import { SessionProvider } from './features/auth/SessionProvider';

function renderApp(path = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <SessionProvider>
          <App />
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => clearCsrfToken());

it('protects a direct workspace visit and associates required errors with inputs', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { detail: 'Sign in', code: 'not_authenticated', errors: {} },
          { status: 403 },
        ),
      ),
  );
  renderApp('/dashboard');
  await screen.findByRole('heading', { name: 'Sign in to your workspace' });
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('Enter your username.')).toBeVisible();
  expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Username')).toHaveAccessibleDescription('Enter your username.');
});

it('preserves credentials after a failure and supports retry, login, and logout', async () => {
  let authenticated = false;
  let attempts = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/csrf/')) return Response.json({ csrf_token: 'masked-token' });
      if (url.endsWith('/login/')) {
        attempts += 1;
        if (attempts === 1)
          return Response.json(
            { detail: 'Incorrect credentials.', code: 'invalid_credentials', errors: {} },
            { status: 400 },
          );
        authenticated = true;
      }
      if (url.endsWith('/logout/')) {
        authenticated = false;
        return new Response(null, { status: 204 });
      }
      return authenticated
        ? Response.json({ id: 1, username: 'planner', role: 'Planner' })
        : Response.json(
            { detail: 'Sign in', code: 'not_authenticated', errors: {} },
            { status: 403 },
          );
    }),
  );
  renderApp();
  await screen.findByLabelText('Username');
  await userEvent.type(screen.getByLabelText('Username'), 'planner');
  await userEvent.type(screen.getByLabelText('Password'), 'kept-secret');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect credentials.');
  expect(screen.getByLabelText('Password')).toHaveValue('kept-secret');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('heading', { name: 'Masses' })).toBeVisible();
  expect(screen.getByText('Planner', { selector: '.role-badge' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
});

it('shows retry when initial identity lookup fails rather than treating failure as anonymous', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(
        Response.json(
          { detail: 'Sign in', code: 'not_authenticated', errors: {} },
          { status: 403 },
        ),
      ),
  );
  renderApp();
  await screen.findByRole('button', { name: 'Try again' });
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Username')).toBeVisible();
});

it('returns to login on session expiry and clears private cached data', async () => {
  let expired = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      expired
        ? Response.json(
            { detail: 'Expired', code: 'not_authenticated', errors: {} },
            { status: 403 },
          )
        : Response.json({ id: 2, username: 'viewer', role: 'Viewer' }),
    ),
  );
  const client = renderApp('/dashboard');
  await screen.findByRole('heading', { name: 'Masses' });
  client.setQueryData(['private-data'], { secret: 'do not retain after logout' });
  expired = true;
  await client.refetchQueries({ queryKey: ['session'] });
  await waitFor(() => expect(screen.getByLabelText('Username')).toBeVisible());
  // Session lookup returns null on expiry, so non-session data must be purged.
  expect(client.getQueryData(['private-data'])).toBeUndefined();
});
