/** Keep the real password input for forms/autofill; preview only a typed character. */
import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import type { ComponentPropsWithRef } from 'react';

export function PasswordInput({
  ref,
  id: suppliedId,
  onInput,
  onCompositionEnd,
  onScroll,
  onBlur,
  onKeyDown,
  className = '',
  ...props
}: Omit<ComponentPropsWithRef<'input'>, 'type'>) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => input.current!, []);
  const [shown, setShown] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [scroll, setScroll] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function concealPreview() {
    clearTimeout(timer.current);
    setPreview(null);
  }

  function previewCharacter(field: HTMLInputElement, data: string | null) {
    if (shown || !data || Array.from(data).length !== 1) return;
    const end = field.selectionStart ?? field.value.length;
    const start = end - data.length;
    if (start < 0 || field.value.slice(start, end) !== data) return;
    setPreview(
      '•'.repeat(Array.from(field.value.slice(0, start)).length) +
        data +
        '•'.repeat(Array.from(field.value.slice(end)).length),
    );
    setScroll(field.scrollLeft);
    timer.current = setTimeout(() => setPreview(null), 1000);
  }

  return (
    <span className="password-control">
      <input
        {...props}
        ref={input}
        id={id}
        type={shown ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`${className} ${preview !== null && !shown ? 'password-previewing' : ''}`}
        onInput={(event) => {
          concealPreview();
          const native = event.nativeEvent as InputEvent;
          // Pasted/autofilled passwords and deletions stay fully masked.
          if (
            !native.isComposing &&
            (native.inputType === 'insertText' || native.inputType === 'insertCompositionText')
          ) {
            previewCharacter(event.currentTarget, native.data);
          }
          onInput?.(event);
        }}
        onCompositionEnd={(event) => {
          concealPreview();
          previewCharacter(event.currentTarget, event.data);
          onCompositionEnd?.(event);
        }}
        onScroll={(event) => {
          setScroll(event.currentTarget.scrollLeft);
          onScroll?.(event);
        }}
        onBlur={(event) => {
          concealPreview();
          onBlur?.(event);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'Escape') {
            concealPreview();
            setShown(false);
          }
          onKeyDown?.(event);
        }}
      />
      {preview !== null && !shown && (
        <span className="password-mask" aria-hidden="true">
          <span style={{ transform: `translateX(${-scroll}px)` }}>{preview}</span>
        </span>
      )}
      <button
        type="button"
        className="password-toggle"
        aria-controls={id}
        aria-label={shown ? 'Hide password' : 'Show password'}
        onPointerDown={(event) => event.preventDefault()}
        disabled={props.disabled}
        onClick={() => {
          concealPreview();
          setShown((value) => !value);
        }}
      >
        {shown ? 'Hide' : 'Show'}
      </button>
    </span>
  );
}
