/** Accessible credentials form: preserves input on failures and never logs passwords. */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';

import { fetchAuthConfig, signIn } from '../api/auth';
import { ApiError } from '../api/client';
import { useSession } from '../features/auth/SessionProvider';
import { AuthActions } from '../components/AuthActions';
import { FloatingNotice } from '../components/FloatingNotice';
import { PasswordInput } from '../components/PasswordInput';
import { PublicLinks } from '../components/PublicLinks';

const credentialsSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});
type Credentials = z.infer<typeof credentialsSchema>;

export function LoginPage() {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!location.state?.focusAuthHeading) return;
    heading.current?.focus();
    // Clear the one-shot flag so reloads and Back navigation don't move focus again.
    void navigate({ pathname: location.pathname, search: location.search }, { replace: true });
  }, [location.state, location.pathname, location.search, navigate]);
  const config = useQuery({ queryKey: ['auth-config'], queryFn: fetchAuthConfig });
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Credentials>();
  if (session.user) {
    const destination = (location.state as { returnTo?: string } | null)?.returnTo;
    return (
      <Navigate
        to={
          destination?.startsWith('/verify-email')
            ? destination
            : session.user.verification_required
              ? '/verify-email'
              : '/dashboard'
        }
        replace
      />
    );
  }
  const expired = Boolean((location.state as { expired?: boolean } | null)?.expired);
  const passwordUpdated = Boolean(
    (location.state as { passwordUpdated?: boolean } | null)?.passwordUpdated,
  );

  async function submit(values: Credentials) {
    setFailure(null);
    const parsed = credentialsSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'username' || field === 'password')
          setError(field, { message: 'This field is required.' }, { shouldFocus: true });
      }
      return;
    }
    try {
      session.acceptUser(await signIn(parsed.data.username, parsed.data.password));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Unable to sign in. Try again.');
      if (error instanceof ApiError) {
        for (const field of ['username', 'password'] as const) {
          const messages = error.fields[field];
          if (Array.isArray(messages) && typeof messages[0] === 'string') {
            setError(field, { message: messages[0] }, { shouldFocus: true });
          }
        }
      }
    }
  }

  return (
    <main className="login-layout">
      <section className="welcome-panel" aria-labelledby="welcome-title">
        <div className="wordmark">
          <span className="mark" aria-hidden="true">
            ♪
          </span>{' '}
          Choralation
        </div>
        <div className="welcome-copy">
          <p className="eyebrow">For your church music team</p>
          <h1 id="welcome-title">
            Make room for <br />
            meaningful music.
          </h1>
          <p>A shared home for the hymns you love and the Masses you prepare together.</p>
        </div>
        <p className="panel-caption">Thoughtful choices. A familiar rhythm.</p>
      </section>
      <section className="login-side" aria-labelledby="login-title">
        <div className="login-card">
          <p className="eyebrow">Welcome back</p>
          <h2 id="login-title" ref={heading} tabIndex={-1}>
            Sign in to your workspace
          </h2>
          <p className="muted">Sign in with your email or username.</p>
          {(passwordUpdated || expired) && (
            <FloatingNotice
              dismiss={() => {
                navigate(location.pathname, {
                  replace: true,
                  state: { ...location.state, expired: false, passwordUpdated: false },
                });
              }}
            >
              {passwordUpdated
                ? 'Password updated. Sign in with your new password.'
                : 'Your session ended. Sign in again to continue.'}
            </FloatingNotice>
          )}
          <form onSubmit={handleSubmit(submit)} noValidate>
            <label htmlFor="username">Email or username</label>
            <input
              id="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={Boolean(errors.username)}
              aria-describedby={errors.username ? 'username-error' : undefined}
              {...register('username', { required: 'Enter your username.' })}
            />
            {errors.username && (
              <p id="username-error" className="field-error">
                {errors.username.message}
              </p>
            )}
            <label htmlFor="password">Password</label>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password', { required: 'Enter your password.' })}
            />
            {errors.password && (
              <p id="password-error" className="field-error">
                {errors.password.message}
              </p>
            )}
            {failure && (
              <FloatingNotice error dismiss={() => setFailure(null)}>
                {failure}
              </FloatingNotice>
            )}
            <AuthActions
              mode="login"
              pending={isSubmitting}
              registrationAvailable={config.data?.registration_enabled !== false}
            />
          </form>
          <p className="account-help">
            {config.data?.password_reset_enabled ? (
              <Link to="/forgot-password">Forgot password?</Link>
            ) : (
              <a href="mailto:tofi.lattouf@gmail.com">Need help signing in? Contact support</a>
            )}
          </p>
          <PublicLinks />
        </div>
      </section>
    </main>
  );
}
