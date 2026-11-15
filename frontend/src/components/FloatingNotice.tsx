import * as Dialog from '@radix-ui/react-dialog';
import { useRef } from 'react';
import type { ReactNode } from 'react';

export function FloatingNotice({
  children,
  dismiss,
  error,
  actions,
  returnFocus,
}: {
  children: ReactNode;
  dismiss: () => void;
  error?: boolean;
  actions?: ReactNode;
  returnFocus?: HTMLElement | null;
}) {
  const previousFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content floating-notice"
          onOpenAutoFocus={() => {
            previousFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnFocus ?? previousFocus.current;
            if (target?.isConnected) target.focus();
          }}
        >
          <Dialog.Title>{error ? 'Something went wrong' : 'Notification'}</Dialog.Title>
          <Dialog.Close
            className="button secondary reader-icon-button notice-close"
            aria-label="Close notification"
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </Dialog.Close>
          <Dialog.Description asChild>
            <div role={error ? 'alert' : 'status'}>{children}</div>
          </Dialog.Description>
          {actions && <div className="form-actions">{actions}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
