/** Revision-bound saved-program actions. Touch finalization and finalized edits/deletes
 * require confirmation; desktop finalization describes its effect on hover/focus.
 */
import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import { deleteMass, transitionMass } from '../../api/masses';
import type { Mass } from '../../api/masses';
import { useSession } from '../auth/SessionProvider';
import { PlannerIcon } from './PlannerIcon';

type Action = 'finalize' | 'edit' | 'delete';
const impact =
  'Finalizing makes this program read-only and adds each hymn selection to usage counts.';
export function MassLifecycle({ mass, unavailable }: { mass: Mass; unavailable: boolean }) {
  const { user } = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [review, setReview] = useState<{ action: Action; snapshot: Mass } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const busy = useRef(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const notice = useId();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const canEdit = Boolean(user && user.role !== 'Viewer');
  const canDelete = user?.role === 'Admin';
  const finalized = mass.status === 'finalized';
  if (!canEdit) return null;
  const disabled = unavailable || pending || stale;
  async function refreshUsage() {
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
  async function confirm(action: Action, snapshot: Mass) {
    if (busy.current || disabled || !canEdit || (action === 'delete' && !canDelete)) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      if (action === 'delete') {
        await deleteMass(snapshot.id, snapshot.revision);
        // Navigate away before invalidating detail reads for a deleted record.
        setReview(null);
        navigate('/masses', { replace: true });
        client.removeQueries({ queryKey: ['mass', String(snapshot.id)] });
        await refreshUsage();
      } else {
        const saved = await transitionMass(snapshot, action === 'edit');
        client.setQueryData(['mass', String(saved.id)], saved);
        setReview(null);
        await refreshUsage();
        if (action === 'edit') navigate(`/masses/${saved.id}/edit`);
      }
    } catch (failure) {
      const conflict =
        failure instanceof ApiError &&
        ['revision_conflict', 'mass_finalized'].includes(failure.code);
      setStale(conflict);
      setError(
        conflict
          ? 'This Mass changed. Check the refreshed program before trying again.'
          : failure instanceof Error
            ? failure.message
            : 'Unable to update this Mass. Try again.',
      );
      if (conflict) setReview(null);
      await refreshUsage();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function request(action: Action, button: HTMLButtonElement) {
    trigger.current = button;
    if (disabled) return;
    setError(null);
    const touch = window.matchMedia?.('(max-width: 760px), (hover: none)').matches ?? false;
    if (action === 'finalize' && !touch) void confirm(action, mass);
    else setReview({ action, snapshot: mass });
  }
  return (
    <>
      <div className="saved-mass-buttons">
        {!finalized && (
          <div className="finalize-control">
            <button
              className="button primary"
              aria-describedby={notice}
              disabled={disabled}
              onClick={(event) => request('finalize', event.currentTarget)}
            >
              {pending ? 'Working…' : 'Finalize Mass'}
            </button>
            <span id={notice} role="tooltip" className="finalize-tooltip">
              {impact}
            </span>
          </div>
        )}
        {finalized ? (
          <button
            className="button secondary icon-button"
            aria-label="Edit Mass"
            title="Edit Mass"
            disabled={disabled}
            onClick={(event) => request('edit', event.currentTarget)}
          >
            <PlannerIcon name="edit" />
          </button>
        ) : (
          <Link
            className="button secondary icon-button"
            aria-label="Edit Mass"
            title="Edit Mass"
            to={`/masses/${mass.id}/edit`}
          >
            <PlannerIcon name="edit" />
          </Link>
        )}
        {finalized && canDelete && (
          <button
            className="button secondary icon-button"
            aria-label="Delete Mass"
            title="Delete Mass"
            disabled={disabled}
            onClick={(event) => request('delete', event.currentTarget)}
          >
            <PlannerIcon name="remove" />
          </button>
        )}
      </div>
      {!review && error && (
        <p className="notice error lifecycle-error" role="alert">
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
          }}
        >
          I've reviewed the refreshed program
        </button>
      )}
      <Dialog.Root
        open={Boolean(review)}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setReview(null);
            setError(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content mass-action-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (trigger.current?.isConnected) trigger.current.focus();
            }}
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
            <Dialog.Title>
              {review?.action === 'delete'
                ? 'Delete this Mass?'
                : review?.action === 'edit'
                  ? 'Edit this finalized Mass?'
                  : 'Finalize this Mass?'}
            </Dialog.Title>
            <Dialog.Description>
              {review?.action === 'delete'
                ? 'Are you sure? This permanently deletes the Mass and its selections, and removes them from usage counts. Hymns remain in the library.'
                : review?.action === 'edit'
                  ? 'Are you sure? Editing returns this Mass to a draft and removes its selections from usage counts until you finalize it again.'
                  : impact}
            </Dialog.Description>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                ref={cancel}
                className="button secondary"
                disabled={pending}
                onClick={() => {
                  setReview(null);
                  setError(null);
                }}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={disabled}
                onClick={() => {
                  if (review) void confirm(review.action, review.snapshot);
                }}
              >
                {pending
                  ? 'Working…'
                  : review?.action === 'delete'
                    ? 'Confirm deletion'
                    : review?.action === 'edit'
                      ? 'Confirm edit'
                      : 'Confirm finalization'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
