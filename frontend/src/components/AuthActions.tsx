import { Link } from 'react-router';

export function AuthActions({
  mode,
  pending = false,
  registrationAvailable = true,
}: {
  mode: 'login' | 'register';
  pending?: boolean;
  registrationAvailable?: boolean;
}) {
  const signingIn = mode === 'login';
  const submitLabel = signingIn ? 'Sign in' : 'Create account';
  const pendingLabel = signingIn ? 'Signing in…' : 'Creating…';
  return (
    <div className="auth-actions">
      {(signingIn || registrationAvailable) && (
        <button className="button primary" type="submit" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </button>
      )}
      <Link
        className="button secondary"
        to={signingIn ? '/register' : '/login'}
        state={{ focusAuthHeading: true }}
      >
        {signingIn ? 'Create account' : 'Sign in'}
      </Link>
    </div>
  );
}
