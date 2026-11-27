/** A write rejection updates every mounted editor without discarding its state. */
import { useSyncExternalStore } from 'react';

let paused = false;
const listeners = new Set<() => void>();
export function setEditingPaused(value: boolean) {
  if (paused === value) return;
  paused = value;
  for (const listener of listeners) listener();
}
export const isEditingPaused = () => paused;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function useEditingPaused() {
  return useSyncExternalStore(subscribe, isEditingPaused);
}
