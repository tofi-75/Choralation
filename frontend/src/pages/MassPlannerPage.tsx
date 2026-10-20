/** Mounted working copy survives refresh errors; revision conflicts require review. */
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, Navigate, useBeforeUnload, useBlocker, useNavigate, useParams } from 'react-router';

import { ApiError } from '../api/client';
import type { Categories, Category } from '../api/library';
import { deleteMass, fetchMass } from '../api/masses';
import type { Mass } from '../api/masses';
import { useSession } from '../features/auth/SessionProvider';
import { useCategories } from '../features/hymns/queries';
import { DraftSaver } from '../features/masses/DraftSaver';
import { newRowKey } from '../features/masses/rowKey';
import type { Draft } from '../features/masses/DraftSaver';
import { PlannerIcon } from '../features/masses/PlannerIcon';
import { MassDateFields } from '../features/masses/MassDateFields';
import { RandomPicker } from '../features/masses/RandomPicker';
import { SortableProgram, reorderPlacement } from '../features/masses/SortableProgram';
import { HymnPicker } from '../features/masses/HymnPicker';

function validationMessages(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(validationMessages);
  return [];
}

export function MassPlannerPage() {
  const { id } = useParams();
  const mass = useQuery({ queryKey: ['mass', id], queryFn: () => fetchMass(id!) });
  const categories = useCategories();
  const client = useQueryClient();
  const [epoch, setEpoch] = useState(0);
  const { user } = useSession();
  // A new editor must start from a fresh read, rather than freeze an old cached
  // program while its mount-time request is still pending. Later refreshes keep it mounted.
  if (mass.isPending || categories.isPending || (mass.isFetching && !mass.isFetchedAfterMount))
    return <p role="status">Loading Mass plan…</p>;
  if (!mass.data || !categories.data)
    return (
      <section role="alert">
        <h1>Unable to open Mass plan</h1>
        <p>{mass.error?.message ?? categories.error?.message}</p>
        <button
          className="button secondary"
          onClick={() => {
            void mass.refetch();
            void categories.refetch();
          }}
        >
          Try again
        </button>
        <Link to="/masses">Return to Mass plans</Link>
      </section>
    );
  if (user?.role === 'Viewer') return <Navigate to={`/masses/${id}`} replace />;
  return (
    <>
      {(mass.error || categories.error) && (
        <p className="notice error" role="alert">
          Unable to refresh this plan. Your edits are kept.{' '}
          <button
            className="button secondary"
            onClick={() => {
              void mass.refetch();
              void categories.refetch();
            }}
          >
            Try again
          </button>
        </p>
      )}
      <DraftEntry
        key={`${id}-${epoch}`}
        initial={mass.data}
        categories={categories.data}
        reload={(saved) => {
          client.setQueryData(['mass', id], saved);
          setEpoch((value) => value + 1);
        }}
      />
    </>
  );
}

/** Decide access on entry only. A background finalize must not unmount local edits. */
function DraftEntry(props: Parameters<typeof Planner>[0]) {
  const [enteredDraft] = useState(() => props.initial.status === 'draft');
  return enteredDraft ? (
    <Planner {...props} />
  ) : (
    <Navigate to={`/masses/${props.initial.id}`} replace />
  );
}

function Planner({
  initial,
  categories,
  reload,
}: {
  initial: Mass;
  categories: Categories;
  reload: (saved: Mass) => void;
}) {
  const [saver] = useState(() => new DraftSaver(initial));
  const subscribe = useCallback((callback: () => void) => saver.subscribe(callback), [saver]);
  const state = useSyncExternalStore(subscribe, () => saver.state);
  const { user } = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [finishing, setFinishing] = useState(false);
  const [detailsStep, setDetailsStep] = useState(false);
  const [randomPending, setRandomPending] = useState(false);
  const editable = user?.role !== 'Viewer' && initial.status === 'draft';
  const readOnly = !editable || finishing;
  const [calendarPending, setCalendarPending] = useState(false);
  const dirty = state.status !== 'Saved' || calendarPending;
  const changeDate = useCallback(
    (date: string, season: number | null) =>
      saver.update({
        ...saver.state.draft,
        metadata: { ...saver.state.draft.metadata, date, liturgical_season_id: season },
      }),
    [saver],
  );
  const blocker = useBlocker(dirty);
  const [picker, setPicker] = useState<Category | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [server, setServer] = useState<Mass | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const pickerTrigger = useRef<HTMLButtonElement | null>(null);
  const lastSavedRevision = useRef(initial.revision);
  useEffect(() => {
    // Navigate only after React has received the saved state, so the unsaved
    // navigation guard cannot intercept a successfully completed Save draft.
    if (finishing && state.status === 'Saved' && !calendarPending)
      navigate(`/masses/${initial.id}`);
  }, [finishing, state.status, calendarPending, initial.id, navigate]);
  useEffect(() => {
    saver.refreshReferences(initial.program, categories['mass-placements']);
  }, [saver, initial, categories]);
  useBeforeUnload((event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  useEffect(() => {
    if (state.status === 'Saved' && state.revision !== lastSavedRevision.current) {
      lastSavedRevision.current = state.revision;
      void client.invalidateQueries({ queryKey: ['masses'] });
      void client.invalidateQueries({ queryKey: ['mass', String(initial.id)] });
    }
  }, [state.status, state.revision, initial.id, client]);
  useEffect(() => {
    const beforeSignout = (event: Event) => {
      if (
        dirty &&
        !window.confirm('Sign out with unsaved Mass edits? Your local edits will be lost.')
      )
        event.preventDefault();
    };
    window.addEventListener('choralation:before-signout', beforeSignout);
    return () => window.removeEventListener('choralation:before-signout', beforeSignout);
  }, [dirty]);
  const draft = state.draft;
  const programWarnings = saver.programWarnings;
  const placements = categories['mass-placements'].filter(
    (row) => row.is_active || draft.rows.some((selection) => selection.placement_id === row.id),
  );
  const activePlacements = placements.filter((row) => row.is_active);
  const filled = activePlacements.filter((row) =>
    draft.rows.some((selection) => selection.placement_id === row.id),
  ).length;
  const update = (next: Draft) => saver.update(next);
  const conflicts =
    state.error instanceof ApiError &&
    ['revision_conflict', 'mass_finalized', 'revision_required'].includes(state.error.code);
  return (
    <div className="mass-planner">
      <Link className="text-button" to="/masses">
        ← Mass plans
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{initial.status} Mass program</p>
          <h1 className="page-title" dir="auto">
            {draft.metadata.title || initial.title}
          </h1>
          <p className="muted">
            {filled} of {activePlacements.length} placements filled · {draft.rows.length} hymns
          </p>
        </div>
        <span className={`save-status ${dirty ? 'pending' : ''}`} role="status" aria-live="polite">
          {calendarPending ? 'Selecting season…' : state.status}
        </span>
      </div>
      {initial.status === 'finalized' && (
        <p className="notice" role="alert">
          This Mass was finalized in another session. Your local version remains below.{' '}
          <Link to={`/masses/${initial.id}`}>Open finalized program</Link>
        </p>
      )}
      {state.error && (
        <section className="notice error" role="alert">
          <p>{state.error.message} Your local edits have been kept.</p>
          {state.error instanceof ApiError && (
            <ul>
              {[...new Set(validationMessages(state.error.fields))].map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          {conflicts ? (
            <button
              className="button secondary"
              onClick={async () => {
                setActionError(null);
                try {
                  setServer(await fetchMass(String(initial.id)));
                } catch (error) {
                  setActionError(
                    error instanceof Error ? error.message : 'Unable to load saved version.',
                  );
                }
              }}
            >
              Review saved version
            </button>
          ) : (
            <button className="button secondary" onClick={() => saver.retry()}>
              Retry save
            </button>
          )}
        </section>
      )}
      {actionError && (
        <p className="notice error" role="alert">
          {actionError}
        </p>
      )}
      {server && (
        <section className="form-section" aria-label="Saved version">
          <h2>Saved version · revision {server.revision}</h2>
          <p dir="auto">
            {server.title} · {server.date} ·{' '}
            {server.liturgical_season?.name ?? 'No season selected'}
          </p>
          <p dir="auto">{server.notes}</p>
          <ul>
            {server.program.map((row) => (
              <li key={row.id} dir="auto">
                {row.placement.name}: {row.hymn.title} — {row.notes}
              </li>
            ))}
          </ul>
          <p>Your local version remains below. Reloading replaces it with this saved version.</p>
          <button
            className="button secondary"
            onClick={async () => {
              if (window.confirm('Discard local edits and load the latest saved version?')) {
                try {
                  const latest = await fetchMass(String(initial.id));
                  client.setQueryData(['mass', String(initial.id)], latest);
                  reload(latest);
                } catch (error) {
                  setActionError(error instanceof Error ? error.message : 'Unable to reload.');
                }
              }
            }}
          >
            Discard local edits and reload
          </button>
        </section>
      )}
      <p className="flow-step">
        Step {detailsStep ? '1 of 2 · Mass details' : '2 of 2 · Hymns and order'}
      </p>
      {!detailsStep && (
        <section className="mass-details-summary" aria-label="Confirmed Mass details">
          <p>
            {draft.metadata.date} ·{' '}
            {categories['liturgical-seasons'].find(
              (row) => row.id === draft.metadata.liturgical_season_id,
            )?.name ?? 'No season selected'}
          </p>
          {draft.metadata.notes && (
            <p className="tiny preserve-lines" dir="auto">
              {draft.metadata.notes}
            </p>
          )}
          <button
            className="text-button"
            disabled={readOnly || randomPending}
            onClick={() => {
              setPicker(null);
              setDetailsStep(true);
            }}
          >
            ← Back to Mass details
          </button>
        </section>
      )}
      {detailsStep && (
        <>
          <fieldset className="form-section form-grid" disabled={readOnly}>
            <legend>Mass details</legend>
            <MassDateFields
              date={draft.metadata.date}
              season={draft.metadata.liturgical_season_id}
              seasons={categories['liturgical-seasons']}
              onChange={changeDate}
              onPending={setCalendarPending}
            />
            <details className="optional-details planner-details">
              <summary>Title and Mass notes</summary>
              <div className="form-grid mass-notes-grid">
                <label className="field">
                  Title
                  <input
                    maxLength={255}
                    dir="auto"
                    value={draft.metadata.title ?? ''}
                    onChange={(event) =>
                      update({
                        ...draft,
                        metadata: { ...draft.metadata, title: event.target.value },
                      })
                    }
                  />
                </label>
                <label className="field">
                  Mass notes
                  <textarea
                    dir="auto"
                    value={draft.metadata.notes ?? ''}
                    onChange={(event) =>
                      update({
                        ...draft,
                        metadata: { ...draft.metadata, notes: event.target.value },
                      })
                    }
                  />
                </label>
              </div>
            </details>
          </fieldset>
          <div className="form-actions">
            <button
              className="button primary"
              disabled={calendarPending || readOnly || !draft.metadata.date || Boolean(state.error)}
              onClick={() => setDetailsStep(false)}
            >
              Next
            </button>
          </div>
        </>
      )}
      {!detailsStep && (
        <section className="planner-sections" aria-label="Hymn program">
          {placements.map((placement) => {
            const rows = draft.rows.filter((row) => row.placement_id === placement.id);
            return (
              <section className="placement-section" aria-label={placement.name} key={placement.id}>
                <div className="section-heading">
                  <h2 dir="auto">
                    {placement.name}
                    {!placement.is_active && ' (inactive)'}
                  </h2>
                  {!readOnly && placement.is_active && (
                    <button
                      className="button secondary icon-button"
                      aria-label={`Add hymn to ${placement.name}`}
                      title={`Add hymn to ${placement.name}`}
                      aria-expanded={picker?.id === placement.id}
                      aria-controls={`picker-${placement.id}`}
                      onClick={(event) => {
                        setReplacing(null);
                        pickerTrigger.current = event.currentTarget;
                        setPicker(picker?.id === placement.id ? null : placement);
                      }}
                    >
                      <span aria-hidden="true">+</span>
                    </button>
                  )}
                </div>
                {picker?.id === placement.id && !readOnly && (
                  <HymnPicker
                    key={`${picker?.id}-${draft.metadata.liturgical_season_id}`}
                    categories={categories}
                    restoreFocus={() => pickerTrigger.current?.focus()}
                    placement={placement}
                    season={draft.metadata.liturgical_season_id}
                    selected={draft.rows
                      .filter((row) => row.key !== replacing)
                      .map((row) => row.hymn.id)}
                    close={() => setPicker(null)}
                    add={(hymn) => {
                      if (!picker) return;
                      update({
                        ...saver.state.draft,
                        // Replacing a choice retains its selection identity, order and notes.
                        rows: replacing
                          ? saver.state.draft.rows.map((row) =>
                              row.key === replacing ? { ...row, hymn } : row,
                            )
                          : [
                              ...saver.state.draft.rows,
                              { key: newRowKey(), placement_id: picker.id, hymn, notes: '' },
                            ],
                      });
                    }}
                  />
                )}
                <SortableProgram
                  rows={rows}
                  disabled={readOnly}
                  onReorder={(keys) => {
                    const latest = saver.state.draft;
                    update({ ...latest, rows: reorderPlacement(latest.rows, placement.id, keys) });
                  }}
                >
                  {(row, handle) => (
                    <>
                      {!readOnly && rows.length > 1 && (
                        <div className="row-reorder">
                          <button {...handle}>
                            <span aria-hidden="true">⠿</span>
                          </button>
                        </div>
                      )}
                      <div className="row-summary">
                        <Link dir="auto" to={`/hymns/${row.hymn.id}`}>
                          {row.hymn.title}
                        </Link>
                        <p className="tiny">
                          {row.hymn.language.name}
                          {!row.hymn.is_active && ' · Inactive hymn retained'}
                        </p>
                        {row.notes && editing !== row.key && (
                          <p className="tiny preserve-lines">{row.notes}</p>
                        )}
                      </div>
                      {!readOnly && (
                        <div className="row-actions">
                          <button
                            className="button secondary icon-button"
                            aria-label={`Edit ${row.hymn.title}`}
                            title="Edit this selection"
                            aria-expanded={editing === row.key}
                            aria-controls={`edit-${row.key}`}
                            onClick={() => setEditing(editing === row.key ? null : row.key)}
                          >
                            <PlannerIcon name="edit" />
                          </button>
                          <button
                            className="button secondary icon-button"
                            aria-label={`Remove ${row.hymn.title}`}
                            title="Remove from this Mass"
                            onClick={() =>
                              update({
                                ...draft,
                                rows: draft.rows.filter((item) => item.key !== row.key),
                              })
                            }
                          >
                            <PlannerIcon name="remove" />
                          </button>
                        </div>
                      )}
                      {editing === row.key && !readOnly && (
                        <div className="selection-editor" id={`edit-${row.key}`}>
                          <label className="field">
                            Notes (optional)
                            <textarea
                              aria-label={`Selection notes for ${row.hymn.title}`}
                              dir="auto"
                              disabled={readOnly}
                              value={row.notes}
                              onChange={(event) =>
                                update({
                                  ...draft,
                                  rows: draft.rows.map((item) =>
                                    item.key === row.key
                                      ? { ...item, notes: event.target.value }
                                      : item,
                                  ),
                                })
                              }
                            />
                          </label>
                          <div className="form-actions">
                            {placement.is_active && (
                              <button
                                className="button secondary"
                                onClick={(event) => {
                                  pickerTrigger.current = event.currentTarget;
                                  setReplacing(row.key);
                                  setPicker(placement);
                                }}
                              >
                                Change hymn
                              </button>
                            )}
                            <Link className="text-button" to={`/hymns/${row.hymn.id}/edit`}>
                              Edit library details
                            </Link>
                            <button className="button secondary" onClick={() => setEditing(null)}>
                              Done
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </SortableProgram>
              </section>
            );
          })}
          {!readOnly && (
            <RandomPicker
              key={`${draft.metadata.date}-${draft.metadata.liturgical_season_id}-${calendarPending}-${activePlacements.map((row) => row.id).join(',')}`}
              massId={initial.id}
              saver={saver}
              placements={activePlacements}
              calendarPending={calendarPending}
              onPending={setRandomPending}
            />
          )}
        </section>
      )}
      {programWarnings.length > 0 && (
        <section className="notice" aria-label="Program warnings">
          <h2>Program notes</h2>
          <ul>
            {programWarnings.map((warning, index) => {
              const hymn = draft.rows.find((row) => row.hymn.id === warning.hymn_id)?.hymn.title;
              const placement = placements.find((row) => row.id === warning.placement_id)?.name;
              const season = categories['liturgical-seasons'].find(
                (row) => row.id === draft.metadata.liturgical_season_id,
              )?.name;
              return (
                <li key={index}>
                  <strong dir="auto">{hymn ?? 'Selected hymn'}</strong>
                  {warning.code === 'duplicate_hymn'
                    ? ' appears more than once in this program.'
                    : warning.code === 'season_mismatch'
                      ? ` is not classified for ${season ?? 'this season'}.`
                      : warning.code === 'placement_mismatch'
                        ? ` is not classified for ${placement ?? 'its placement'}.`
                        : ` is retained in ${placement ?? 'its placement'} with an inactive hymn or placement.`}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {editable && !detailsStep && (
        <div className="form-actions sticky-form-actions">
          <button
            className="button primary"
            disabled={calendarPending || randomPending || finishing || Boolean(state.error)}
            onClick={async () => {
              setFinishing(true);
              await saver.flush();
              if (saver.state.status !== 'Saved') setFinishing(false);
            }}
          >
            {finishing ? 'Saving draft…' : 'Save draft'}
          </button>
          {user?.role === 'Admin' && (
            <button
              ref={deleteTrigger}
              className="button secondary"
              disabled={dirty || finishing || randomPending}
              onClick={() => setDeleting(true)}
            >
              Delete draft
            </button>
          )}
        </div>
      )}
      <Dialog.Root
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>Leave unsaved draft?</Dialog.Title>
            <Dialog.Description>
              Your latest edits have not been confirmed as saved.
            </Dialog.Description>
            <div className="form-actions">
              <button
                className="button secondary"
                autoFocus
                onClick={() => {
                  if (blocker.state === 'blocked') blocker.reset();
                }}
              >
                Stay here
              </button>
              <button
                className="button primary"
                onClick={() => {
                  if (blocker.state === 'blocked') blocker.proceed();
                }}
              >
                Leave page
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={deleting} onOpenChange={setDeleting}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              cancelDelete.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              deleteTrigger.current?.focus();
            }}
          >
            <Dialog.Title>Delete this draft?</Dialog.Title>
            <Dialog.Description>
              This removes the Mass and its program. Hymns remain in the library.
            </Dialog.Description>
            <div className="form-actions">
              <button
                ref={cancelDelete}
                className="button secondary"
                disabled={busy}
                onClick={() => setDeleting(false)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await deleteMass(initial.id, state.revision);
                    void client.invalidateQueries({ queryKey: ['masses'] });
                    navigate('/masses', { replace: true });
                  } catch (error) {
                    setActionError(error instanceof Error ? error.message : 'Unable to delete.');
                    setDeleting(false);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Confirm deletion
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
