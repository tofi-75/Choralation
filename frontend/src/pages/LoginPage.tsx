/** Accessible credentials form: preserves input on failures and never logs passwords. */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation } from 'react-router';
import { z } from 'zod';

import { signIn } from '../api/auth';
import { ApiError } from '../api/client';
import { useSession } from '../features/auth/SessionProvider';

const credentialsSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});
type Credentials = z.infer<typeof credentialsSchema>;

export function LoginPage() {
  const session = useSession();
  const location = useLocation();
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Credentials>();
  if (session.user) return <Navigate to="/dashboard" replace />;
  const expired = Boolean((location.state as { expired?: boolean } | null)?.expired);

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
          Mass Hymn Picker
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
          <h2 id="login-title">Sign in to your workspace</h2>
          <p className="muted">Use the account provided by your team coordinator.</p>
          {expired && (
            <p className="notice" role="status">
              Your session ended. Sign in again to continue.
            </p>
          )}
          <form onSubmit={handleSubmit(submit)} noValidate>
            <label htmlFor="username">Username</label>
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
            <input
              id="password"
              type="password"
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
              <p className="notice error" role="alert">
                {failure}
              </p>
            )}
            <button className="button primary full-width" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="account-help">Need access? Contact your team coordinator.</p>
        </div>
      </section>
    </main>
  );
}
