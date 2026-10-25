import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import {
  changePassword,
  fetchAuthConfig,
  registerAccount,
  requestReset,
  resendVerification,
  resetPassword,
  setEmail,
  signOut,
  verifyEmail,
  setChoirCreationPermission,
} from '../api/auth';
import { ApiError } from '../api/client';
import { useSession } from '../features/auth/SessionProvider';
import { PasswordInput } from '../components/PasswordInput';
import { PublicLinks } from '../components/PublicLinks';

function accountError(error: unknown) {
  return error instanceof ApiError
    ? [
        error.message,
        ...Object.values(error.fields)
          .flat()
          .filter((value) => typeof value === 'string'),
      ].join(' ')
    : error instanceof Error
      ? error.message
      : 'Please try again.';
}

function PasswordField({
  name,
  label,
  confirmation = false,
}: {
  name: string;
  label: string;
  confirmation?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <PasswordInput
        id={id}
        name={name}
        required
        maxLength={256}
        autoComplete={
          confirmation
            ? 'new-password'
            : name === 'current_password'
              ? 'current-password'
              : 'new-password'
        }
      />
    </div>
  );
}

export function AccountPages({
  mode,
}: {
  mode: 'register' | 'verify' | 'forgot' | 'reset' | 'account';
}) {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [link, setLink] = useState(() => ({
    pathname: location.pathname,
    token: new URLSearchParams(location.hash.slice(1)).get('token') ?? '',
  }));
  const token = link.pathname === location.pathname ? link.token : '';
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const verificationRequest = useRef<{
    token: string;
    promise: ReturnType<typeof verifyEmail>;
  } | null>(null);
  const verificationReturn =
    mode === 'verify' && token
      ? { returnTo: `/verify-email#token=${encodeURIComponent(token)}` }
      : undefined;
  const config = useQuery({
    queryKey: ['auth-config'],
    queryFn: fetchAuthConfig,
    enabled: mode !== 'account',
  });
  useEffect(() => {
    const incoming = new URLSearchParams(location.hash.slice(1)).get('token') ?? '';
    setLink((previous) =>
      incoming
        ? { pathname: location.pathname, token: incoming }
        : previous.pathname === location.pathname
          ? previous
          : { pathname: location.pathname, token: '' },
    );
    if (incoming)
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: location.state,
      });
  }, [location.hash, location.pathname, location.search, location.state, navigate]);
  useEffect(() => {
    if (mode !== 'verify' || !token || !config.data?.email_verification_enabled) return;
    // Reattach to the same request on StrictMode remounts; never consume twice.
    if (verificationRequest.current?.token !== token)
      verificationRequest.current = { token, promise: verifyEmail(token) };
    let active = true;
    setPending(true);
    setError('');
    void verificationRequest.current.promise
      .then((user) => {
        if (!active) return;
        session.acceptUser(user);
        navigate('/dashboard', { replace: true });
      })
      .catch((failure: unknown) => {
        if (active) setError(accountError(failure));
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, [mode, token, config.data?.email_verification_enabled, session.acceptUser, navigate]);
  useEffect(() => {
    if (config.data?.email_verification_enabled === false && session.user?.verification_required)
      window.dispatchEvent(new Event('choralation:session-refresh'));
  }, [config.data?.email_verification_enabled, session.user?.verification_required]);
  const title = {
    register: 'Create your account',
    verify: 'Verify your email',
    forgot: 'Forgot password',
    reset: 'Choose a new password',
    account: 'Account settings',
  }[mode];
  const Container = mode === 'account' ? 'div' : 'main';
  const emailPage = mode === 'verify' || mode === 'forgot' || mode === 'reset';
  const emailDisabled =
    mode === 'verify'
      ? config.data?.email_verification_enabled === false
      : config.data?.password_reset_enabled === false;
  if (emailPage && (config.isPending || config.error || emailDisabled))
    return (
      <main className="account-page">
        <section className="form-section account-card">
          <p className="eyebrow">Choralation</p>
          <h1>{mode === 'verify' ? 'Email verification' : 'Account recovery'}</h1>
          {config.isPending ? (
            <p role="status">Checking account options…</p>
          ) : config.error ? (
            <>
              <p role="alert">Unable to load account options.</p>
              <button className="button secondary" onClick={() => void config.refetch()}>
                Retry
              </button>
            </>
          ) : (
            <>
              <p>
                {mode === 'verify'
                  ? 'Email verification is not required right now. This link will not sign you in.'
                  : 'Email password recovery is currently unavailable.'}
              </p>
              <p>
                For help accessing your account, contact{' '}
                <a href="mailto:tofi.lattouf@gmail.com">tofi.lattouf@gmail.com</a>.
              </p>
              <Link className="button primary" to={session.user ? '/dashboard' : '/login'}>
                {session.user ? 'Go to Home' : 'Sign in'}
              </Link>
            </>
          )}
        </section>
        <PublicLinks />
      </main>
    );
  if (mode === 'register' && session.user)
    return (
      <Navigate to={session.user.verification_required ? '/verify-email' : '/dashboard'} replace />
    );
  if (mode === 'account' && !session.user) return <Navigate to="/login" replace />;
  async function run(action: () => Promise<void>) {
    if (pending) return;
    setError('');
    setNotice('');
    setPending(true);
    try {
      await action();
    } catch (e) {
      setError(accountError(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <Container className="account-page">
      <section className="form-section account-card">
        <Link
          className="text-button"
          to={session.user && !session.user.verification_required ? '/dashboard' : '/login'}
          state={verificationReturn}
        >
          ← {session.user && !session.user.verification_required ? 'Home' : 'Sign in'}
        </Link>
        <p className="eyebrow">Choralation</p>
        <h1>{title}</h1>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {mode === 'register' && (
          <>
            {config.isPending && <p role="status">Checking registration…</p>}
            {config.error && (
              <p role="alert">
                {config.error.message}
                <button onClick={() => void config.refetch()}>Retry</button>
              </p>
            )}
            {config.data && !config.data.registration_enabled && (
              <p className="notice">Registration is not open yet. Please check back later.</p>
            )}
            {config.data?.registration_enabled && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    session.acceptUser(
                      await registerAccount({
                        username: String(f.get('username')),
                        email: String(f.get('email')),
                        password: String(f.get('password')),
                        password_confirmation: String(f.get('confirmation')),
                      }),
                    );
                  });
                }}
              >
                <label className="field">
                  Username
                  <input
                    name="username"
                    required
                    maxLength={150}
                    autoComplete="username"
                    autoCapitalize="none"
                  />
                </label>
                <label className="field">
                  Email
                  <input name="email" type="email" required autoComplete="email" />
                </label>
                <PasswordField name="password" label="Password" />
                <PasswordField name="confirmation" label="Confirm password" confirmation />
                <p className="tiny muted">
                  Choose a strong password.
                  {config.data?.email_verification_enabled &&
                    ' You’ll verify your email before accessing the app.'}
                </p>
                <button className="button primary" disabled={pending}>
                  {pending ? 'Creating…' : 'Create account'}
                </button>
              </form>
            )}
          </>
        )}
        {mode === 'verify' && (
          <>
            {token ? (
              <>
                {pending && <p role="status">Verifying your email and signing you in…</p>}
                {error && (
                  <>
                    <p>This link could not be completed. You can retry or request a new link.</p>
                    <button
                      className="button primary"
                      disabled={pending}
                      onClick={() =>
                        void run(async () => {
                          session.acceptUser(await verifyEmail(token));
                          navigate('/dashboard', { replace: true });
                        })
                      }
                    >
                      Retry verification
                    </button>
                    {session.user && (
                      <button
                        className="text-button"
                        disabled={pending}
                        onClick={() =>
                          void run(async () => {
                            await signOut();
                            session.clearSession();
                            session.acceptUser(await verifyEmail(token));
                            navigate('/dashboard', { replace: true });
                          })
                        }
                      >
                        Sign out and verify this account
                      </button>
                    )}
                    <Link
                      to="/verify-email"
                      onClick={() => {
                        verificationRequest.current = null;
                        setLink({ pathname: location.pathname, token: '' });
                        setError('');
                      }}
                    >
                      Request a new verification link
                    </Link>
                  </>
                )}
              </>
            ) : !session.user ? (
              <p>
                Sign in to the account that requested this verification link.{' '}
                <Link to="/login" state={verificationReturn}>
                  Sign in
                </Link>
              </p>
            ) : (
              <>
                <p>Verify an email address to access your choirs and the hymn library.</p>
                {session.user.email_verified ? (
                  <p className="notice">
                    Your email is verified. <Link to="/dashboard">Continue</Link>
                  </p>
                ) : (
                  <>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void run(async () => {
                          session.acceptUser(await setEmail(String(f.get('email'))));
                          setNotice((await resendVerification()).detail);
                        });
                      }}
                    >
                      <label className="field">
                        Email address
                        <input
                          name="email"
                          type="email"
                          required
                          defaultValue={session.user.email ?? ''}
                          autoComplete="email"
                        />
                      </label>
                      <button className="button secondary" disabled={pending}>
                        Save email and send link
                      </button>
                    </form>
                    <p className="tiny muted">
                      Check your inbox and spam folder. Links expire after 24 hours.
                    </p>
                  </>
                )}
                <button
                  className="text-button"
                  disabled={pending}
                  onClick={() =>
                    void run(async () => {
                      await signOut();
                      session.clearSession();
                      navigate('/login', { state: verificationReturn });
                    })
                  }
                >
                  Sign out
                </button>
              </>
            )}
          </>
        )}
        {mode === 'forgot' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => setNotice((await requestReset(String(f.get('email')))).detail));
            }}
          >
            <p>We’ll send a reset link if this address belongs to a verified account.</p>
            <label className="field">
              Email
              <input type="email" name="email" required autoComplete="email" />
            </label>
            <button className="button primary" disabled={pending}>
              Send reset link
            </button>
          </form>
        )}
        {(mode === 'reset' || mode === 'account') && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                const password = String(f.get('password'));
                if (password !== f.get('confirmation')) throw new Error('Passwords do not match.');
                if (mode === 'reset') await resetPassword(token, password);
                else await changePassword(String(f.get('current_password')), password);
                session.clearSession();
                navigate('/login', { replace: true, state: { passwordUpdated: true } });
              });
            }}
          >
            {mode === 'account' && (
              <>
                <p>{session.user?.email}</p>
                <PasswordField name="current_password" label="Current password" />
              </>
            )}
            {mode === 'reset' && !token ? (
              <p className="notice">
                Open the link from your email. <Link to="/forgot-password">Request a new link</Link>
              </p>
            ) : (
              <>
                <PasswordField name="password" label="New password" />
                <PasswordField name="confirmation" label="Confirm new password" confirmation />
                <button className="button primary" disabled={pending}>
                  Update password
                </button>
              </>
            )}
          </form>
        )}
      </section>
      <PublicLinks />
      {mode === 'account' && session.user?.role === 'Admin' && (
        <section className="detail-section">
          <h2>Choir creation permissions</h2>
          <p>
            Grant or revoke permission to create additional choirs. Membership and planning roles
            stay unchanged.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () =>
                setNotice(
                  (
                    await setChoirCreationPermission(
                      String(f.get('username')),
                      f.has('can_create_choirs'),
                    )
                  ).detail,
                ),
              );
            }}
          >
            <label className="field">
              Username
              <input name="username" required maxLength={150} />
            </label>
            <label className="checkbox-choice">
              <input name="can_create_choirs" type="checkbox" />
              Can create choirs
            </label>
            <button className="button secondary" disabled={pending}>
              Update permission
            </button>
          </form>
        </section>
      )}
    </Container>
  );
}
