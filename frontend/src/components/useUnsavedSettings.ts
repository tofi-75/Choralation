import { useEffect } from 'react';
import { useBlocker } from 'react-router';

/** Protect drafts on router navigation (including Back), reload, choir switches and sign-out. */
export function useUnsavedSettings(dirty: boolean) {
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm('Discard your unsaved settings changes?')) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const signout = (event: Event) => {
      if (!window.confirm('Discard your unsaved settings changes?')) event.preventDefault();
    };
    window.addEventListener('beforeunload', unload);
    window.addEventListener('choralation:before-signout', signout);
    return () => {
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('choralation:before-signout', signout);
    };
  }, [dirty]);
}
