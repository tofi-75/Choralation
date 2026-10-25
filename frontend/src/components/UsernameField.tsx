import { useEffect, useId, useState } from 'react';
import { checkUsername } from '../api/auth';

export function UsernameField() {
  const id = useId();
  const [name, setName] = useState('');
  const [result, setResult] = useState<{
    name: string;
    available?: boolean;
    detail: string;
  } | null>(null);
  useEffect(() => {
    if (!name.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void checkUsername(name, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setResult({ name, ...data });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setResult({
              name,
              detail:
                'Availability could not be checked. We’ll check again when you create your account.',
            });
        });
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [name]);
  const current = result?.name === name ? result : null;
  return (
    <div className="field">
      <label htmlFor={`${id}-input`}>Username</label>
      <input
        id={`${id}-input`}
        name="username"
        required
        maxLength={150}
        autoComplete="username"
        autoCapitalize="none"
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-invalid={current?.available === false || undefined}
        aria-describedby={id}
      />
      <span
        id={id}
        className={`tiny username-availability ${current?.available === false ? 'field-error' : ''}`}
        role="status"
      >
        {name.trim()
          ? (current?.detail ?? 'Checking availability…')
          : 'Choose a unique username. Usernames are not case-sensitive.'}
      </span>
    </div>
  );
}
