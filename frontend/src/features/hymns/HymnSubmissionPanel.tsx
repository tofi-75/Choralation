import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import type { Hymn } from '../../api/library';
import { reviewHymn, submitHymn } from '../../api/library';
import { useSession } from '../auth/SessionProvider';
import { useChoir } from '../choirs/ChoirProvider';
import { useRefreshLibrary } from './queries';

export function HymnSubmissionPanel({ hymn }: { hymn: Hymn }) {
  const { user } = useSession();
  const { active, choirs } = useChoir();
  const refresh = useRefreshLibrary();
  const navigate = useNavigate();
  const [choir, setChoir] = useState(String(active?.id ?? choirs[0]?.id ?? ''));
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if ((hymn.publication_status ?? 'published') === 'published') return null;
  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? [
              failure.message,
              ...Object.values(failure.fields)
                .flat()
                .filter((value) => typeof value === 'string'),
            ].join(' ')
          : failure instanceof Error
            ? failure.message
            : 'Unable to complete this action.',
      );
    } finally {
      setPending(false);
    }
  }
  const owner = user?.id === hymn.created_by;
  return (
    <section className="form-section" aria-label="Hymn publication">
      <h2>
        {hymn.publication_status === 'pending'
          ? 'Awaiting planner approval'
          : hymn.publication_status === 'declined'
            ? 'Changes requested'
            : 'Private hymn'}
      </h2>
      <p>
        This hymn is not in the shared library or Mass pickers. Approval publishes its metadata,
        lyrics and PDF to all signed-in users and makes it available to all choirs.
      </p>
      {hymn.submission?.choir_name && <p>Submitted to {hymn.submission.choir_name}.</p>}
      {hymn.submission?.note && (
        <p className="notice preserve-lines" dir="auto">
          Planner feedback: {hymn.submission.note}
        </p>
      )}
      {owner &&
        hymn.publication_status !== 'pending' &&
        (choirs.length ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => submitHymn(hymn, Number(choir)));
            }}
          >
            <label className="field">
              Choir for approval
              <select required value={choir} onChange={(event) => setChoir(event.target.value)}>
                <option value="">Choose a choir</option>
                {choirs.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button primary" disabled={pending}>
              Request planner approval
            </button>
          </form>
        ) : (
          <p>
            <Link to="/choirs/join">Join a choir</Link> to request planner approval. Your private
            hymn is saved.
          </p>
        ))}
      {owner && hymn.publication_status === 'pending' && (
        <p>
          Editing this hymn withdraws the pending version. Submit it again after saving your
          changes.
        </p>
      )}
      {hymn.submission?.can_review && (
        <div>
          <label className="field">
            Feedback (optional)
            <textarea
              value={note}
              maxLength={1000}
              rows={3}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <div className="form-actions">
            <button
              className="button primary"
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  await reviewHymn(hymn, 'approve', note);
                  navigate('/choirs', { state: { hymnReview: 'approved' } });
                })
              }
            >
              Approve and publish
            </button>
            <button
              className="button secondary"
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  await reviewHymn(hymn, 'decline', note);
                  navigate('/choirs', { state: { hymnReview: 'declined' } });
                })
              }
            >
              Request changes
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
