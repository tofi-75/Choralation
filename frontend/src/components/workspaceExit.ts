import { useEffect } from 'react';
import type { Confirm } from './ConfirmationProvider';

const eventName = 'choralation:before-signout';

export async function confirmWorkspaceExit(confirm: Confirm) {
  const detail: { message?: string } = {};
  const event = new CustomEvent(eventName, { detail, cancelable: true });
  if (!window.dispatchEvent(event)) return false;
  return detail.message ? confirm(detail.message, 'Discard changes') : true;
}

export function useWorkspaceExitWarning(dirty: boolean, message: string) {
  useEffect(() => {
    if (!dirty) return;
    function warn(event: Event) {
      const { detail } = event as CustomEvent<{ message?: string }>;
      if (detail) detail.message ??= message;
    }
    window.addEventListener(eventName, warn);
    return () => window.removeEventListener(eventName, warn);
  }, [dirty, message]);
}
