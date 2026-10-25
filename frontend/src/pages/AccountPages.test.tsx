import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Link, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountPages } from './AccountPages';
import { LoginPage } from './LoginPage';
import { clearCsrfToken } from '../api/client';

const session = vi.hoisted(() => ({
  user: null as null | {
    id: number;
    email: string;
    email_verified: boolean;
    verification_required: boolean;
  },
  acceptUser: vi.fn(),
  clearSession: vi.fn(),
}));
vi.mock('../features/auth/SessionProvider', () => ({ useSession: () => session }));

afterEach(() => {
  vi.unstubAllGlobals();
  clearCsrfToken();
  session.user = null;
  session.acceptUser.mockClear();
  session.clearSession.mockClear();
});
function mount(path = '/register') {
  render(
    <StrictMode>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={[path]}>
          <Link to="/verify-email#token=fictional-late-link">Open verification email</Link>
          <Routes>
            <Route path="/register" element={<AccountPages mode="register" />} />
            <Route path="/verify-email" element={<AccountPages mode="verify" />} />
            <Route path="/reset-password" element={<AccountPages mode="reset" />} />
            <Route path="/forgot-password" element={<AccountPages mode="forgot" />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<h1>Home</h1>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}
const enabledConfig = {
  registration_enabled: true,
  email_verification_enabled: true,
  password_reset_enabled: true,
};
const verified = {
  id: 1,
  username: 'member',
  role: 'Viewer',
  email: 'member@example.test',
  email_verified: true,
  verification_required: false,
};
function captureVerification() {
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.endsWith('/config/')
        ? enabledConfig
        : url.endsWith('/csrf/')
          ? { csrf_token: 'masked' }
          : verified,
    ),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

it('keeps registration visibly closed until owner activation', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ registration_enabled: false })),
  );
  mount();
  expect(await screen.findByText(/Registration is not open yet/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument();
});

it('shows the registration form once local registration is enabled', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ registration_enabled: true })),
  );
  mount();
  expect(await screen.findByRole('button', { name: 'Create account' })).toBeVisible();
  expect(screen.getByLabelText('Username', { exact: true })).toBeVisible();
  expect(screen.getByLabelText('Email', { exact: true })).toBeVisible();
});

it.each([false, true])(
  'verifies once and opens Home without sign-in (session: %s)',
  async (signedIn) => {
    if (signedIn)
      session.user = { ...verified, email_verified: false, verification_required: true };
    const fetch = captureVerification();
    mount('/verify-email#token=fictional-verification-token');
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeVisible();
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/verify-email/'))).toHaveLength(1);
    expect(session.acceptUser).toHaveBeenCalledWith(verified);
  },
);

it('handles an email link arriving on an already open verification page', async () => {
  const fetch = captureVerification();
  mount('/verify-email');
  expect(fetch.mock.calls.filter(([url]) => !url.endsWith('/config/'))).toHaveLength(0);
  await userEvent.click(screen.getByRole('link', { name: 'Open verification email' }));
  expect(await screen.findByRole('heading', { name: 'Home' })).toBeVisible();
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/verify-email/'))).toHaveLength(1);
});

it('shows invalid link errors without retrying automatically or signing in', async () => {
  const fetch = vi.fn(async (url: string) =>
    url.endsWith('/config/')
      ? Response.json(enabledConfig)
      : url.endsWith('/csrf/')
        ? Response.json({ csrf_token: 'masked' })
        : Response.json(
            { detail: 'This link is invalid or expired.', code: 'invalid', errors: {} },
            { status: 400 },
          ),
  );
  vi.stubGlobal('fetch', fetch);
  mount('/verify-email#token=expired-fictional-link');
  expect(await screen.findByRole('alert')).toHaveTextContent('invalid or expired');
  expect(session.acceptUser).not.toHaveBeenCalled();
  expect(await screen.findByRole('button', { name: 'Retry verification' })).toBeEnabled();
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/verify-email/'))).toHaveLength(1);
  await userEvent.click(screen.getByRole('link', { name: 'Request a new verification link' }));
  expect(await screen.findByText(/Sign in to the account that requested/)).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/verify-email/'))).toHaveLength(1);
});

it('redirects a successful password reset to sign-in with a success notice', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(
        url.endsWith('/config/')
          ? enabledConfig
          : url.endsWith('/csrf/')
            ? { csrf_token: 'masked' }
            : { detail: 'Password updated.' },
      ),
    ),
  );
  mount('/reset-password#token=fictional-reset-link');
  await userEvent.type(
    await screen.findByLabelText('New password', { exact: true }),
    'New-fictional-password!42',
  );
  await userEvent.type(screen.getByLabelText('Confirm new password'), 'New-fictional-password!42');
  await userEvent.click(screen.getByRole('button', { name: 'Update password' }));
  expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Password updated. Sign in with your new password.',
  );
  expect(session.clearSession).toHaveBeenCalledOnce();
});

it('keeps failed password reset on the form without clearing the session', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('/config/')
        ? Response.json(enabledConfig)
        : url.endsWith('/csrf/')
          ? Response.json({ csrf_token: 'masked' })
          : Response.json(
              { detail: 'This link has expired.', code: 'invalid', errors: {} },
              { status: 400 },
            ),
    ),
  );
  mount('/reset-password#token=expired-reset-link');
  await userEvent.type(
    await screen.findByLabelText('New password', { exact: true }),
    'New-fictional-password!42',
  );
  await userEvent.type(screen.getByLabelText('Confirm new password'), 'New-fictional-password!42');
  await userEvent.click(screen.getByRole('button', { name: 'Update password' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('expired'));
  expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  expect(session.clearSession).not.toHaveBeenCalled();
});

it.each(['/verify-email#token=old-link', '/reset-password#token=old-link', '/forgot-password'])(
  'disables email actions without posting or signing in on %s',
  async (path) => {
    const fetch = vi.fn(async () =>
      Response.json({
        registration_enabled: true,
        email_verification_enabled: false,
        password_reset_enabled: false,
      }),
    );
    vi.stubGlobal('fetch', fetch);
    mount(path);
    expect(await screen.findByText(/For help accessing your account/)).toBeVisible();
    expect(session.acceptUser).not.toHaveBeenCalled();
    expect(fetch.mock.calls).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Update password' })).not.toBeInTheDocument();
  },
);

it('offers owner-assisted recovery on sign-in in simple mode', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        registration_enabled: true,
        email_verification_enabled: false,
        password_reset_enabled: false,
      }),
    ),
  );
  mount('/login');
  expect(
    await screen.findByRole('link', { name: 'Need help signing in? Contact support' }),
  ).toHaveAttribute('href', 'mailto:tofi.lattouf@gmail.com');
  expect(screen.queryByRole('link', { name: 'Forgot password?' })).not.toBeInTheDocument();
});
