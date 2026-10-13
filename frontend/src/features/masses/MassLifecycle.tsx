/** One-click finalization explains its impact inline; revisions still guard every write.
 * Reopening keeps an Admin confirmation. Conflicts refresh the saved program and
 * require explicit acknowledgement before a fresh finalization attempt.
 */
import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';

import { ApiError } from '../../api/client';
import { transitionMass } from '../../api/masses';
import type { Mass } from '../../api/masses';
import { useSession } from '../auth/SessionProvider';

export function MassLifecycle({ mass, unavailable }: { mass: Mass; unavailable: boolean }) {
  const { user } = useSession();
  const client = useQueryClient();
  const [review, setReview] = useState<Mass | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const busy = useRef(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const finalize = useRef<HTMLButtonElement>(null);
  const notice = useId();
  const reopen = mass.status === 'finalized';
  const allowed = Boolean(user && user.role !== 'Viewer' && (!reopen || user.role === 'Admin'));
  if (!allowed && !review) return null;
  async function refreshUsage() {
    // Refresh even uncertain writes: the server may have committed before a connection failed.
    await Promise.all(
      [
        'mass',
        'masses',
        'mass-history',
        'hymns',
        'hymn',
        'hymn-usage',
        'dashboard',
        'recommendations',
      ].map((key) => client.invalidateQueries({ queryKey: [key] })),
    );
  }
  async function confirm(snapshot: Mass) {
    if (busy.current || pending || stale || unavailable || !allowed) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      // Capture exactly the displayed revision. Never retry a conflicting write automatically.
      const saved = await transitionMass(snapshot, snapshot.status === 'finalized');
      client.setQueryData(['mass', String(saved.id)], saved);
      await refreshUsage();
      setReview(null);
    } catch (failure) {
      const conflict =
        failure instanceof ApiError &&
        ['revision_conflict', 'mass_finalized'].includes(failure.code);
      setStale(conflict);
      setError(
        conflict
          ? review
            ? 'This Mass changed. Close this review, check the refreshed program, then try again.'
            : 'This Mass changed. Check the refreshed program before finalizing.'
          : failure instanceof Error
            ? failure.message
            : 'Unable to change Mass status. Try again.',
      );
      await refreshUsage();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  if (!reopen && !review)
    return (
      <section className="mass-lifecycle-inline" aria-label="Finalize Mass">
        <p id={notice} className="tiny muted">
          Finalizing makes this program read-only and adds each hymn selection to usage counts.
        </p>
        <button
          ref={finalize}
          className="button primary"
          aria-describedby={notice}
          disabled={unavailable || pending || stale || !allowed}
          onClick={() => void confirm(mass)}
        >
          {pending ? 'Working…' : 'Finalize Mass'}
        </button>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {stale && (
          <button
            className="text-button"
            disabled={unavailable || pending}
            onClick={() => {
              setStale(false);
              setError(null);
              requestAnimationFrame(() => finalize.current?.focus());
            }}
          >
            I've reviewed the refreshed program
          </button>
        )}
      </section>
    );
  return (
    <Dialog.Root
      open={Boolean(review)}
      onOpenChange={(open) => {
        if (!pending && !open) setReview(null);
      }}
    >
      <Dialog.Trigger
        className="button primary"
        disabled={unavailable || pending || !allowed}
        onClick={() => {
          setReview(mass);
          setError(null);
          setStale(false);
        }}
      >
        Reopen draft
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancel.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (pending) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          <Dialog.Title>Reopen this Mass?</Dialog.Title>
          <Dialog.Description>
            Reopening allows editing and removes this program from hymn usage until it is finalized
            again.
          </Dialog.Description>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button primary"
              disabled={pending || stale || unavailable || !allowed}
              onClick={() => {
                if (review) void confirm(review);
              }}
            >
              {pending ? 'Working…' : 'Reopen draft'}
            </button>
            <Dialog.Close className="button secondary" ref={cancel} disabled={pending}>
              Cancel
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
