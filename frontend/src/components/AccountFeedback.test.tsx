import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { UsernameField } from './UsernameField';
import { PasswordStrength, passwordRequirements } from './PasswordStrength';
import { clearCsrfToken } from '../api/client';

afterEach(() => {
  vi.unstubAllGlobals();
  clearCsrfToken();
});
it('checks usernames after editing, ignores a stale response, and reports taken/available', async () => {
  let resolveOld!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/csrf/')) return Response.json({ csrf_token: 'masked' });
      const name = JSON.parse(String(options?.body)).username;
      if (name === 'old')
        return new Promise<Response>((resolve) => {
          resolveOld = resolve;
        });
      return Response.json({
        available: name !== 'taken',
        detail: name === 'taken' ? 'Choose another username.' : 'Username is available.',
      });
    }),
  );
  render(<UsernameField />);
  const field = screen.getByLabelText('Username', { exact: true });
  fireEvent.change(field, { target: { value: 'old' } });
  await waitFor(() => expect(resolveOld).toBeDefined());
  fireEvent.change(field, { target: { value: 'taken' } });
  expect(await screen.findByText('Choose another username.')).toBeVisible();
  resolveOld(Response.json({ available: true, detail: 'Stale available result' }));
  expect(field).toHaveAttribute('aria-invalid', 'true');
  fireEvent.change(field, { target: { value: 'fresh' } });
  expect(await screen.findByText('Username is available.')).toBeVisible();
  expect(screen.queryByText('Stale available result')).not.toBeInTheDocument();
});

it('scores password requirements locally and recognizes symbols without accepting spaces', () => {
  expect(passwordRequirements('Abcdef1!').every((rule) => rule.met)).toBe(true);
  expect(passwordRequirements('Abcdef1_').every((rule) => rule.met)).toBe(true);
  expect(passwordRequirements('Abcdefg1 ').every((rule) => rule.met)).toBe(false);
  const view = render(<PasswordStrength password="weak" id="strength" />);
  expect(screen.getByText('Weak')).toBeVisible();
  expect(screen.getByRole('meter')).toHaveAttribute('value', '0');
  view.rerender(<PasswordStrength password="Long-password3!" id="strength" />);
  expect(screen.getByText('Strong')).toBeVisible();
  expect(screen.getByRole('meter')).toHaveAttribute('value', '4');
});
