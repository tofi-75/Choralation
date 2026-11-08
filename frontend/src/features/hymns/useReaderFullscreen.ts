import { useEffect, useRef } from 'react';

export function useReaderFullscreen(open: boolean, onNativeExit: () => void) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!open || !root) return;
    let entered = document.fullscreenElement === root;
    const change = () => {
      if (document.fullscreenElement === root) entered = true;
      else if (entered) onNativeExit();
    };
    document.addEventListener('fullscreenchange', change);
    return () => {
      document.removeEventListener('fullscreenchange', change);
      if (document.fullscreenElement === root) void document.exitFullscreen().catch(() => {});
    };
  }, [open, onNativeExit]);

  function requestFullscreen() {
    const root = rootRef.current;
    if (!root || document.fullscreenElement?.contains(root)) return;
    try {
      void root.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
    } catch {
      // The dialog still fills the available viewport if native fullscreen is blocked.
    }
  }

  return { rootRef, requestFullscreen };
}
