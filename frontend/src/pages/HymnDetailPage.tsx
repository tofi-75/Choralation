/** Saved metadata and Admin confirmations; no speculative usage/history values. */
import * as Dialog from '@radix-ui/react-dialog';
import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { deleteHymn, setHymnActive, textFields } from '../api/library';
import { useSession } from '../features/auth/SessionProvider';
import { CategoryChips } from '../features/hymns/HymnSummary';
import { useHymn, useRefreshLibrary } from '../features/hymns/queries';

export function HymnDetailPage() {
  const { id } = useParams();
  const { user } = useSession();
  const hymn = useHymn(id);
  const refresh = useRefreshLibrary();
  const navigate = useNavigate();
  const location = useLocation();
  const [action, setAction] = useState<'active' | 'delete' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const actionTrigger = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  async function confirm() {
    if (!hymn.data) return;
    setPending(true);
    setFailure(null);
    try {
      if (action === 'delete') await deleteHymn(hymn.data.id);
      else await setHymnActive(hymn.data.id, !hymn.data.is_active);
      setAction(null);
      if (action === 'delete') {
        navigate('/hymns', { replace: true });
        await refresh();
      } else await refresh();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Unable to make this change.');
    } finally {
      setPending(false);
    }
  }
  if (hymn.isPending) return <p role="status">Loading hymn…</p>;
  if (hymn.error || !hymn.data)
    return (
      <section role="alert">
        <h1>Unable to open hymn</h1>
        <p>{hymn.error?.message}</p>
        <button className="button secondary" onClick={() => void hymn.refetch()}>
          Try again
        </button>
        <Link to="/hymns">Return to library</Link>
      </section>
    );
  const saved = hymn.data;
  const operation =
    action === 'delete' ? 'Delete hymn' : saved.is_active ? 'Deactivate hymn' : 'Reactivate hymn';
  return (
    <>
      <Link className="text-button" to="/hymns">
        ← Hymn library
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Hymn detail</p>
          <h1 className="page-title" dir="auto">
            {saved.title}
          </h1>
          <p className="muted" dir="auto">
            {saved.language.name} · {saved.is_active ? 'Active' : 'Inactive'}
            {saved.is_polyphonic && ' · Polyphonic'}
          </p>
        </div>
        {user?.role !== 'Viewer' && (
          <Link className="button primary" to={`/hymns/${saved.id}/edit`}>
            Edit hymn
          </Link>
        )}
      </div>
      {Boolean((location.state as { saved?: boolean } | null)?.saved) && (
        <p className="notice" role="status">
          Hymn saved.
        </p>
      )}
      {!saved.is_active && (
        <p className="notice">This hymn is inactive. Its saved information is retained.</p>
      )}
      <section className="detail-section" aria-labelledby="classification-title">
        <h2 id="classification-title">Classification</h2>
        <dl className="detail-grid">
          <div>
            <dt>Genres</dt>
            <dd>
              <CategoryChips categories={saved.genres} />
            </dd>
          </div>
          <div>
            <dt>Placements</dt>
            <dd>
              <CategoryChips categories={saved.placements} />
            </dd>
          </div>
          <div>
            <dt>Seasons</dt>
            <dd>
              {saved.is_season_neutral && <span className="chip">Season-neutral</span>}
              <CategoryChips categories={saved.seasons} />
            </dd>
          </div>
          <div>
            <dt>Tags</dt>
            <dd>
              <CategoryChips categories={saved.tags} />
            </dd>
          </div>
        </dl>
      </section>
      {saved.is_polyphonic && (
        <section className="detail-section" aria-labelledby="voices-title">
          <h2 id="voices-title">Voices</h2>
          {saved.voices.length ? (
            <ul className="voice-list">
              {saved.voices.map((voice) => (
                <li className="chip" key={voice} dir="auto">
                  {voice}
                </li>
              ))}
            </ul>
          ) : (
            <p className="tiny">Voice names have not been added yet.</p>
          )}
        </section>
      )}
      {(saved.sheet_music_pdf || saved.sheet_music_url) && (
        <section className="detail-section" aria-labelledby="sheet-title">
          <h2 id="sheet-title">Sheet music</h2>
          {saved.sheet_music_pdf && (
            <a
              className="button secondary pdf-download"
              href={saved.sheet_music_pdf.url}
              dir="auto"
            >
              Download PDF · {saved.sheet_music_pdf.name}
            </a>
          )}
          {saved.sheet_music_url && (
            <p>
              <a
                className="text-button"
                href={saved.sheet_music_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open sheet music link
              </a>
            </p>
          )}
        </section>
      )}
      <section className="detail-section" aria-labelledby="metadata-title">
        <h2 id="metadata-title">Details and references</h2>
        <dl className="detail-grid">
          {textFields
            .filter(([name]) => saved[name] && name !== 'sheet_music_url')
            .map(([name, label]) => (
              <div key={name} className={name === 'notes' ? 'full-width' : ''}>
                <dt>{label}</dt>
                <dd dir="auto" className={name === 'notes' ? 'preserve-lines' : ''}>
                  {saved[name] ? (
                    name.endsWith('_url') && /^https?:\/\//.test(saved[name]) ? (
                      <a
                        className="text-button"
                        href={saved[name]}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {saved[name]}
                      </a>
                    ) : (
                      saved[name]
                    )
                  ) : (
                    <span className="muted">Not provided</span>
                  )}
                </dd>
              </div>
            ))}
          {saved.estimated_duration_minutes && (
            <div>
              <dt>Estimated duration</dt>
              <dd>
                {saved.estimated_duration_minutes
                  ? `${saved.estimated_duration_minutes} minutes`
                  : 'Not provided'}
              </dd>
            </div>
          )}
          <div>
            <dt>Added</dt>
            <dd>
              <time dateTime={saved.created_at}>{new Date(saved.created_at).toLocaleString()}</time>
            </dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>
              <time dateTime={saved.updated_at}>{new Date(saved.updated_at).toLocaleString()}</time>
            </dd>
          </div>
        </dl>
      </section>
      {user?.role === 'Admin' && (
        <section className="admin-actions" aria-label="Admin actions">
          <h2>Manage this hymn</h2>
          <p className="muted">
            Deactivate to retain its information. Deletion permanently removes an unreferenced hymn.
          </p>
          <button
            className="button secondary"
            onClick={(event) => {
              actionTrigger.current = event.currentTarget;
              setFailure(null);
              setAction('active');
            }}
          >
            {saved.is_active ? 'Deactivate hymn' : 'Reactivate hymn'}
          </button>
          <button
            className="button danger"
            onClick={(event) => {
              actionTrigger.current = event.currentTarget;
              setFailure(null);
              setAction('delete');
            }}
          >
            Delete hymn
          </button>
        </section>
      )}
      <Dialog.Root
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setAction(null);
            setFailure(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              cancelButton.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              actionTrigger.current?.focus();
            }}
            className="dialog-content"
            onEscapeKeyDown={(event) => {
              if (pending) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (pending) event.preventDefault();
            }}
          >
            <Dialog.Title>{operation}?</Dialog.Title>
            <Dialog.Description>
              {action === 'delete'
                ? 'This permanently removes the hymn. Referenced hymns cannot be deleted; deactivate them instead.'
                : 'Saved classifications are retained. You can change the active status again later.'}
            </Dialog.Description>
            {failure && (
              <p className="notice error" role="alert">
                {failure}
              </p>
            )}
            <div className="form-actions">
              <button
                className={`button ${action === 'delete' ? 'danger' : 'primary'}`}
                disabled={pending}
                onClick={() => void confirm()}
              >
                {pending ? 'Working…' : operation}
              </button>
              <Dialog.Close ref={cancelButton} className="button secondary" disabled={pending}>
                Cancel
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
