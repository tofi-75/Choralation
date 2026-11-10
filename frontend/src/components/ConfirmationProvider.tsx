import * as Dialog from '@radix-ui/react-dialog';
import { createContext, useContext, useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type Confirm = (message: string, action?: string) => Promise<boolean>;
const ConfirmationContext = createContext<Confirm>(async () => {
  throw new Error('A confirmation requires ConfirmationProvider.');
});

export function useConfirmation() {
  return useContext(ConfirmationContext);
}

type Request = {
  message: string;
  action: string;
  trigger: HTMLElement | null;
  resolve: (confirmed: boolean) => void;
};

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const pending = useRef<Request | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<Confirm>((message, action = 'Continue') => {
    if (pending.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const next = {
        message,
        action,
        trigger: document.activeElement as HTMLElement | null,
        resolve,
      };
      pending.current = next;
      setRequest(next);
    });
  }, []);

  function settle(confirmed: boolean) {
    const active = pending.current;
    if (!active) return;
    pending.current = null;
    setRequest(null);
    active.resolve(confirmed);
  }

  return (
    <ConfirmationContext.Provider value={confirm}>
      {children}
      {request && (
        <Dialog.Root
          open
          onOpenChange={(open) => {
            if (!open) settle(false);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content
              className="dialog-content"
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                cancel.current?.focus();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                request.trigger?.focus();
              }}
            >
              <Dialog.Title>Confirm action</Dialog.Title>
              <Dialog.Description>{request.message}</Dialog.Description>
              <div className="form-actions">
                <button
                  ref={cancel}
                  type="button"
                  className="button secondary"
                  onClick={() => settle(false)}
                >
                  Cancel
                </button>
                <button type="button" className="button primary" onClick={() => settle(true)}>
                  {request.action}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </ConfirmationContext.Provider>
  );
}
