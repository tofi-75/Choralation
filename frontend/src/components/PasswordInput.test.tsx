import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { PasswordInput } from './PasswordInput';

afterEach(() => vi.useRealTimers());

function mount() {
  const result = render(<PasswordInput aria-label="Password" name="password" />);
  return {
    ...result,
    input: screen.getByLabelText('Password', { exact: true }) as HTMLInputElement,
  };
}

it('shows only the newest typed character, and masks it exactly one second later', () => {
  vi.useFakeTimers();
  const { input, container } = mount();
  fireEvent.input(input, {
    target: { value: 'a', selectionStart: 1 },
    data: 'a',
    inputType: 'insertText',
  });
  expect(container.querySelector('.password-mask')).toHaveTextContent('a');
  act(() => vi.advanceTimersByTime(600));
  fireEvent.input(input, {
    target: { value: 'ab', selectionStart: 2 },
    data: 'b',
    inputType: 'insertText',
  });
  expect(container.querySelector('.password-mask')).toHaveTextContent('•b');
  act(() => vi.advanceTimersByTime(999));
  expect(container.querySelector('.password-mask')).toHaveTextContent('•b');
  act(() => vi.advanceTimersByTime(1));
  expect(container.querySelector('.password-mask')).toBeNull();
  expect(input).toHaveAttribute('type', 'password');
  expect(input).toHaveValue('ab');
});

it('handles a character inserted in the middle without revealing its neighbours', () => {
  const { input, container } = mount();
  fireEvent.input(input, { target: { value: 'ab' }, inputType: 'insertFromPaste' });
  fireEvent.input(input, {
    target: { value: 'aجb', selectionStart: 2 },
    data: 'ج',
    inputType: 'insertText',
  });
  expect(container.querySelector('.password-mask')).toHaveTextContent('•ج•');
  expect(container.querySelector('.password-mask')).toHaveAttribute('aria-hidden', 'true');
  fireEvent.blur(input);
  expect(container.querySelector('.password-mask')).toBeNull();
});

it('conceals pasted, autofilled and deleted text immediately', () => {
  const { input, container } = mount();
  fireEvent.input(input, { target: { value: 'a' }, data: 'a', inputType: 'insertText' });
  fireEvent.input(input, {
    target: { value: 'pasted' },
    data: 'pasted',
    inputType: 'insertFromPaste',
  });
  expect(container.querySelector('.password-mask')).toBeNull();
  fireEvent.input(input, { target: { value: 'autofilled' }, inputType: 'insertReplacementText' });
  expect(container.querySelector('.password-mask')).toBeNull();
  fireEvent.input(input, { target: { value: 'autofille' }, inputType: 'deleteContentBackward' });
  expect(container.querySelector('.password-mask')).toBeNull();
});

it('waits for composed characters to be committed and conceals them on Enter', () => {
  const { input, container } = mount();
  fireEvent.input(input, {
    target: { value: 'ج', selectionStart: 1 },
    data: 'ج',
    inputType: 'insertCompositionText',
    isComposing: true,
  });
  expect(container.querySelector('.password-mask')).toBeNull();
  fireEvent.compositionEnd(input, { data: 'ج' });
  expect(container.querySelector('.password-mask')).toHaveTextContent('ج');
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(container.querySelector('.password-mask')).toBeNull();
});

it('toggles visibility without submitting or changing the actual form value', () => {
  const submit = vi.fn((event) => event.preventDefault());
  const ref = createRef<HTMLInputElement>();
  render(
    <form onSubmit={submit}>
      <PasswordInput
        ref={ref}
        aria-label="Password"
        name="password"
        autoComplete="current-password"
      />
    </form>,
  );
  const input = screen.getByLabelText('Password', { exact: true });
  fireEvent.input(input, { target: { value: 'saved-password' }, inputType: 'insertFromPaste' });
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(input).toHaveAttribute('type', 'text');
  expect(input).toHaveAttribute('autoComplete', 'current-password');
  expect(new FormData(input.closest('form')!).get('password')).toBe('saved-password');
  expect(ref.current).toBe(input);
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(input).toHaveAttribute('type', 'password');
  expect(submit).not.toHaveBeenCalled();
});

it('preserves the selection when switching password visibility', () => {
  const { input } = mount();
  fireEvent.input(input, { target: { value: 'abcdef' }, inputType: 'insertFromPaste' });
  input.setSelectionRange(2, 4);
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect([input.selectionStart, input.selectionEnd]).toEqual([2, 4]);
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect([input.selectionStart, input.selectionEnd]).toEqual([2, 4]);
});
