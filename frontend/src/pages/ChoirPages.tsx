import * as Dialog from '@radix-ui/react-dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router';
import {
  cancelApplication,
  changeMember,
  decideApplication,
  fetchApplications,
  fetchChoir,
  fetchDirectory,
  joinChoir,
  lookupCode,
  regenerateCode,
  saveChoir,
} from '../api/choirs';
import type { Choir, ChoirInput } from '../api/choirs';
import { ApiError } from '../api/client';
import { useSession } from '../features/auth/SessionProvider';
import { useChoir } from '../features/choirs/ChoirProvider';
import { HymnReviewQueue } from '../features/hymns/HymnReviewQueue';
import { ChoirJoinRequests } from '../features/choirs/ChoirJoinRequests';

function ChoirFields({ choir }: { choir?: Choir }) {
  return (
    <>
      <label className="field">
        Choir name <span className="required-marker">*</span>
        <input name="name" required maxLength={150} defaultValue={choir?.name} />
      </label>
      <label className="field">
        Description
        <textarea name="description" maxLength={2000} rows={3} defaultValue={choir?.description} />
      </label>
      <label className="checkbox-choice">
        <input name="is_public" type="checkbox" defaultChecked={choir?.is_public ?? false} />
        List this choir in the public directory
      </label>
      <label className="checkbox-choice">
        <input
          name="show_member_count"
          type="checkbox"
          defaultChecked={choir?.show_member_count ?? true}
        />
        Show member count to people outside this choir
      </label>
    </>
  );
}
function choirValues(form: HTMLFormElement): ChoirInput {
  const f = new FormData(form);
  return {
    name: String(f.get('name')),
    description: String(f.get('description')),
    is_public: f.has('is_public'),
    show_member_count: f.has('show_member_count'),
  };
}
export function ChoirPages({ mode }: { mode: 'list' | 'join' | 'new' | 'detail' }) {
  const { id } = useParams();
  const location = useLocation();
  const hymnReview = (location.state as { hymnReview?: string } | null)?.hymnReview;
  const { user } = useSession();
  const context = useChoir();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [directoryPage, setDirectoryPage] = useState(1);
  const [code, setCode] = useState('');
  const [found, setFound] = useState<Choir | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    action: () => Promise<unknown>;
  } | null>(null);
  const detail = useQuery({
    queryKey: ['choir-detail', id],
    queryFn: () => fetchChoir(id!),
    enabled: mode === 'detail' && Boolean(id),
  });
  const directory = useQuery({
    queryKey: ['choir-directory', search, directoryPage],
    queryFn: () => fetchDirectory(search, directoryPage),
    enabled: mode === 'join',
  });
  const applications = useQuery({
    queryKey: ['choir-applications'],
    queryFn: fetchApplications,
    enabled: mode === 'list' || mode === 'join',
  });
  async function refresh() {
    await Promise.all([
      context.refresh(),
      client.invalidateQueries({ queryKey: ['choir-detail'] }),
      client.invalidateQueries({ queryKey: ['choir-applications'] }),
      client.invalidateQueries({ queryKey: ['choir-join-requests'] }),
      client.invalidateQueries({ queryKey: ['session'] }),
    ]);
  }
  async function run(action: () => Promise<unknown>, message = 'Changes saved.') {
    if (pending) return;
    setPending(true);
    setError('');
    setNotice('');
    try {
      await action();
      await refresh();
      setNotice(message);
      setConfirmation(null);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? [
              e.message,
              ...Object.values(e.fields)
                .flat()
                .filter((v) => typeof v === 'string'),
            ].join(' ')
          : e instanceof Error
            ? e.message
            : 'Please try again.',
      );
    } finally {
      setPending(false);
    }
  }
  function requestJoin(choir: Choir, privateCode?: string) {
    void run(
      () => joinChoir(choir.id, privateCode),
      'Request sent. A choir planner will review it.',
    );
  }
  function card(choir: Choir, canJoin = false, privateCode?: string) {
    const application = applications.data?.find(
      (a) => a.choir_id === choir.id && a.status === 'pending',
    );
    const joined = context.choirs.some((c) => c.id === choir.id);
    return (
      <li className="choir-card" key={choir.id}>
        <div>
          <h2 dir="auto">
            {canJoin ? choir.name : <Link to={`/choirs/${choir.id}`}>{choir.name}</Link>}
          </h2>
          <p className="muted preserve-lines" dir="auto">
            {choir.description}
          </p>
          <p className="tiny">
            {choir.is_public ? 'Public' : 'Private'}
            {choir.member_count !== null &&
              ` · ${choir.member_count} ${choir.member_count === 1 ? 'member' : 'members'}`}
            {!canJoin && ` · ${choir.role}`}
          </p>
        </div>
        {canJoin ? (
          <button
            className="button secondary"
            disabled={pending || Boolean(application) || joined}
            onClick={() => requestJoin(choir, privateCode)}
          >
            {joined ? 'Joined' : application ? 'Request pending' : 'Request to join'}
          </button>
        ) : (
          <div className="form-actions">
            <Link className="button secondary" to={`/choirs/${choir.id}`}>
              {choir.role === 'Planner' || user?.role === 'Admin' ? 'Manage choir' : 'View choir'}
            </Link>
            <button
              className="button secondary"
              disabled={context.active?.id === choir.id}
              onClick={() => void context.select(choir.id)}
            >
              {context.active?.id === choir.id ? 'Selected' : 'Use choir'}
            </button>
          </div>
        )}
      </li>
    );
  }
  const saved = detail.data;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your music community</p>
          <h1 className="page-title">
            {
              {
                list: 'Choirs',
                join: 'Join a choir',
                new: 'Create a choir',
                detail: saved?.name ?? 'Choir',
              }[mode]
            }
          </h1>
        </div>
        <div className="form-actions">
          {mode === 'list' ? (
            <>
              <Link className="button secondary" to="/choirs/join">
                Join choir
              </Link>
              {user?.can_create_choirs && (
                <Link className="button primary" to="/choirs/new">
                  Create choir
                </Link>
              )}
            </>
          ) : (
            <Link className="button secondary" to="/choirs">
              My choirs
            </Link>
          )}
        </div>
      </div>
      {mode === 'list' && ['approved', 'declined'].includes(hymnReview ?? '') && (
        <p className="notice" role="status">
          {hymnReview === 'approved'
            ? 'Hymn approved and published.'
            : 'Changes requested. The hymn remains private.'}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {mode === 'list' && (
        <>
          {(user?.role === 'Admin' || context.choirs.some((choir) => choir.role === 'Planner')) && (
            <ChoirJoinRequests
              pending={pending}
              onDecision={(choir, request, status) =>
                run(
                  () => decideApplication(choir, request, status),
                  status === 'approved' ? 'Member approved.' : 'Request declined.',
                )
              }
            />
          )}
          {(user?.role === 'Admin' || context.choirs.some((choir) => choir.role === 'Planner')) && (
            <HymnReviewQueue />
          )}
          {context.choirs.length === 0 && (
            <section className="form-section">
              <h2>Find your choir</h2>
              <p>
                Join a public choir or ask a planner for a private choir’s eight-character code.
                Your request needs planner approval.
              </p>
            </section>
          )}
          <ul className="choir-list">{context.choirs.map((c) => card(c))}</ul>
          <section className="detail-section">
            <h2>Your applications</h2>
            {applications.isPending && <p role="status">Loading applications…</p>}
            {applications.error && <p role="alert">{applications.error.message}</p>}
            {!applications.data?.length && <p className="muted">No applications yet.</p>}
            <ul className="choir-list">
              {applications.data?.map((a) => (
                <li className="member-row" key={a.id}>
                  <span>
                    {a.choir_name} <small className="muted">· {a.status}</small>
                  </span>
                  {a.status === 'pending' && (
                    <button
                      className="text-button"
                      disabled={pending}
                      onClick={() => void run(() => cancelApplication(a.id), 'Request cancelled.')}
                    >
                      Cancel request
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      {mode === 'join' && (
        <>
          <section className="form-section">
            <h2>Have a private choir code?</h2>
            <form
              className="choir-code-form"
              onSubmit={(e) => {
                e.preventDefault();
                setFound(null);
                void run(async () => {
                  setFound(await lookupCode(code));
                }, '');
              }}
            >
              <label className="field">
                Choir code
                <input
                  name="code"
                  required
                  maxLength={16}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setFound(null);
                  }}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="ABCDEFGH"
                />
              </label>
              <button className="button secondary" disabled={pending}>
                Find choir
              </button>
            </form>
            {found && <ul className="choir-list">{card(found, true, code)}</ul>}
          </section>
          <section className="home-section">
            <h2>Public choirs</h2>
            <label className="field">
              Search choirs
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setDirectoryPage(1);
                }}
                placeholder="Choir name"
              />
            </label>
            {directory.isPending && <p role="status">Loading public choirs…</p>}
            {directory.error && <p role="alert">{directory.error.message}</p>}
            {directory.data?.count === 0 && <p>No public choirs match.</p>}
            <ul className="choir-list">{directory.data?.results.map((c) => card(c, true))}</ul>
            <div className="form-actions">
              <button
                className="button secondary"
                disabled={!directory.data?.previous}
                onClick={() => setDirectoryPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>Page {directoryPage}</span>
              <button
                className="button secondary"
                disabled={!directory.data?.next}
                onClick={() => setDirectoryPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </section>
        </>
      )}
      {mode === 'new' &&
        (user?.can_create_choirs ? (
          <form
            className="form-section choir-editor"
            onSubmit={(e) => {
              e.preventDefault();
              const data = choirValues(e.currentTarget);
              void run(async () => {
                const created = await saveChoir(data);
                await context.refresh();
                navigate(`/choirs/${created.id}`);
              }, 'Choir created.');
            }}
          >
            <ChoirFields />
            <button className="button primary" disabled={pending}>
              Create choir
            </button>
          </form>
        ) : (
          <p className="notice">An app administrator must grant permission to create choirs.</p>
        ))}
      {mode === 'detail' && (
        <>
          {detail.isPending && <p role="status">Loading choir…</p>}
          {detail.error && (
            <p className="notice error" role="alert">
              {detail.error.message}
            </p>
          )}
          {saved && (
            <>
              <p className="muted" dir="auto">
                {saved.description}
              </p>
              <p className="tiny">
                {saved.is_public ? 'Public' : 'Private'} · {saved.members.length} members
              </p>
              {saved.role === 'Planner' && <HymnReviewQueue choirId={saved.id} />}
              {saved.role === 'Planner' && (
                <>
                  <details className="form-section">
                    <summary>Choir settings</summary>
                    <form
                      key={`${saved.id}-${saved.name}-${saved.is_public}-${saved.show_member_count}`}
                      className="choir-editor"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const data = choirValues(e.currentTarget);
                        void run(() => saveChoir(data, saved.id));
                      }}
                    >
                      <ChoirFields choir={saved} />
                      <button className="button primary" disabled={pending}>
                        Save settings
                      </button>
                    </form>
                  </details>
                  <section className="detail-section">
                    <h2>Join code</h2>
                    <div className="form-actions">
                      <code className="choir-code">{saved.code}</code>
                      <button
                        className="button secondary"
                        onClick={() =>
                          void run(
                            () => navigator.clipboard.writeText(saved.code ?? ''),
                            'Code copied.',
                          )
                        }
                      >
                        Copy code
                      </button>
                      <button
                        className="text-button"
                        disabled={pending}
                        onClick={() =>
                          setConfirmation({
                            title: 'Generate a new code?',
                            description:
                              'The current code will stop working immediately. Existing memberships and pending requests will stay unchanged.',
                            action: () => regenerateCode(saved.id),
                          })
                        }
                      >
                        Generate new code
                      </button>
                    </div>
                  </section>
                  <section className="detail-section">
                    <h2>Join requests</h2>
                    {!saved.requests?.length && <p className="muted">No pending requests.</p>}
                    <ul className="choir-list">
                      {saved.requests?.map((a) => (
                        <li className="member-row" key={a.id}>
                          <strong>{a.username}</strong>
                          <div className="form-actions">
                            <button
                              className="button primary"
                              disabled={pending}
                              onClick={() =>
                                void run(
                                  () => decideApplication(saved.id, a.id, 'approved'),
                                  'Member approved.',
                                )
                              }
                            >
                              Approve
                            </button>
                            <button
                              className="button secondary"
                              disabled={pending}
                              onClick={() =>
                                void run(
                                  () => decideApplication(saved.id, a.id, 'declined'),
                                  'Request declined.',
                                )
                              }
                            >
                              Decline
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}
              <section className="detail-section">
                <h2>Members</h2>
                <ul className="choir-list">
                  {saved.members.map((m) => (
                    <li className="member-row" key={m.id}>
                      <span>
                        <strong>{m.username}</strong>
                        <small className="muted"> · {m.role}</small>
                      </span>
                      <div className="form-actions">
                        {saved.role === 'Planner' && (
                          <button
                            className="text-button"
                            disabled={pending}
                            onClick={() =>
                              setConfirmation({
                                title:
                                  m.role === 'Planner' ? 'Demote planner?' : 'Appoint planner?',
                                description: `Change ${m.username} to ${m.role === 'Planner' ? 'Member' : 'Planner'} in this choir?`,
                                action: () =>
                                  changeMember(
                                    saved.id,
                                    m.id,
                                    m.role === 'Planner' ? 'Member' : 'Planner',
                                  ),
                              })
                            }
                          >
                            {m.role === 'Planner' ? 'Make member' : 'Make planner'}
                          </button>
                        )}
                        {(saved.role === 'Planner' || m.user_id === user?.id) && (
                          <button
                            className="text-button"
                            disabled={pending}
                            onClick={() =>
                              setConfirmation({
                                title:
                                  m.user_id === user?.id ? 'Leave this choir?' : 'Remove member?',
                                description:
                                  'This removes access to the choir’s Masses. The last planner must appoint a replacement first.',
                                action: async () => {
                                  await changeMember(saved.id, m.id);
                                  if (m.user_id === user?.id) navigate('/choirs');
                                },
                              })
                            }
                          >
                            {m.user_id === user?.id ? 'Leave choir' : 'Remove'}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </>
      )}
      <Dialog.Root
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirmation(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>{confirmation?.title}</Dialog.Title>
            <Dialog.Description>{confirmation?.description}</Dialog.Description>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                className="button primary"
                disabled={pending}
                onClick={() => confirmation && void run(confirmation.action)}
              >
                Confirm
              </button>
              <Dialog.Close className="button secondary" disabled={pending}>
                Cancel
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
