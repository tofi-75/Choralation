import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

export function FloatingNotice({
  children,
  dismiss,
  error,
  actions,
  dismissOnOutsideInteraction = true,
}: {
  children: ReactNode;
  dismiss: () => void;
  error?: boolean;
  actions?: ReactNode;
  dismissOnOutsideInteraction?: boolean;
}) {
  return (
    <Dialog.Root
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <Dialog.Portal>
        <Dialog.Content
          className="dialog-content floating-notice"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (!dismissOnOutsideInteraction) event.preventDefault();
          }}
        >
          <Dialog.Title>{error ? 'Something went wrong' : 'Notification'}</Dialog.Title>
          <Dialog.Description asChild>
            <div role={error ? 'alert' : 'status'}>{children}</div>
          </Dialog.Description>
          <div className="form-actions">
            {actions}
            <Dialog.Close className="button primary">Dismiss</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
