import { useEffect } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router';
import { useConfirmation } from './ConfirmationProvider';
import { useWorkspaceExitWarning } from './workspaceExit';

const warning = 'Discard your unsaved settings changes?';

/** Protect drafts on router navigation (including Back), reload, choir switches and sign-out. */
export function useUnsavedSettings(dirty: boolean) {
  const blocker = useBlocker(dirty);
  const confirm = useConfirmation();
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let active = true;
    void confirm(warning, 'Discard changes').then((discard) => {
      if (!active) return;
      if (discard) blocker.proceed();
      else blocker.reset();
    });
    return () => {
      active = false;
    };
  }, [blocker, confirm]);

  useBeforeUnload((event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  useWorkspaceExitWarning(dirty, warning);
}
