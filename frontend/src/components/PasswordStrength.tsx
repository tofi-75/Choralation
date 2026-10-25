/** Local feedback only: passwords never leave this component for scoring. */
export function passwordRequirements(password: string) {
  return [
    { label: '8 characters', met: [...password].length >= 8 },
    { label: 'Uppercase letter (A–Z)', met: /[A-Z]/.test(password) },
    { label: 'Number', met: /[0-9]/.test(password) },
    { label: 'Symbol', met: /[^\p{L}\p{N}\s]/u.test(password) },
  ];
}

export function PasswordStrength({ password, id }: { password: string; id: string }) {
  const rules = passwordRequirements(password);
  const score = rules.filter((rule) => rule.met).length;
  const label = !password
    ? 'Choose a password'
    : score < 4
      ? 'Weak'
      : password.length < 12
        ? 'Fair'
        : 'Strong';
  return (
    <div className="password-strength" id={id}>
      <div className="password-strength-heading">
        <span>Password strength</span>
        <span aria-live="polite">{label}</span>
      </div>
      <meter min={0} max={4} value={score} aria-label="Password strength" />
      <ul>
        {rules.map((rule) => (
          <li key={rule.label} data-met={rule.met}>
            <span aria-hidden="true">{rule.met ? '✓' : '○'}</span> {rule.label}
            <span className="sr-only">: {rule.met ? 'met' : 'needed'}</span>
          </li>
        ))}
      </ul>
      <p className="tiny muted">
        Use a unique password. Common passwords and passwords similar to your account details are
        not accepted.
      </p>
    </div>
  );
}
