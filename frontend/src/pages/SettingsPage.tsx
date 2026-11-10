import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { setDefaultChoir } from '../api/auth';
import type { User } from '../api/auth';
import { useChoir } from '../features/choirs/ChoirProvider';
import { AccountPages } from './AccountPages';
import { useConfirmation } from '../components/ConfirmationProvider';
import { confirmWorkspaceExit } from '../components/workspaceExit';
import { FloatingNotice } from '../components/FloatingNotice';
import * as Dialog from '@radix-ui/react-dialog';
import { categoryKinds } from '../api/library';
import type { Category, CategoryKind } from '../api/library';
import {
  categoryImpact,
  listCategories,
  saveCategory,
  deactivateCategory,
  deleteCategory,
  reorderCategories,
  settingsError,
} from '../api/settings';
import { useSession } from '../features/auth/SessionProvider';
import { ManagerRequests, useManagerQueue } from '../features/auth/ManagerRequests';
import { useUnsavedSettings } from '../components/useUnsavedSettings';

export function SettingsPage() {
  const { user } = useSession();
  const [params] = useSearchParams();
  const admin = user?.role === 'Admin';
  const managerQueue = useManagerQueue(1, admin);
  const pendingManagers = managerQueue.data?.count;
  const requested = params.get('tab');
  const tab =
    requested === 'account' || requested === 'choir' || (admin && requested === 'manager-requests')
      ? requested
      : admin
        ? 'classifications'
        : 'choir';
  const tabs = [
    { key: 'choir', label: 'Choir', url: '/settings?tab=choir' },
    { key: 'account', label: 'Account', url: '/settings?tab=account' },
    ...(admin
      ? [
          {
            key: 'manager-requests',
            label: `Manager requests${pendingManagers ? ` (${pendingManagers})` : ''}`,
            url: '/settings?tab=manager-requests',
          },
          { key: 'classifications', label: 'Classifications', url: '/settings' },
        ]
      : []),
  ];
  return (
    <div className="settings-page">
      <h1 className="page-title">Settings</h1>
      <nav className="settings-tabs" aria-label="Settings tabs">
        {tabs.map(({ key, label, url }) => (
          <Link
            key={key}
            className={tab === key ? 'button primary' : 'button secondary'}
            to={url}
            aria-current={tab === key ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === 'account' ? (
        <AccountPages mode="account" />
      ) : tab === 'choir' ? (
        <ChoirPreference />
      ) : tab === 'manager-requests' ? (
        <ManagerRequests />
      ) : (
        <Classifications />
      )}
    </div>
  );
}

function ChoirPreference() {
  const { user } = useSession();
  const { choirs } = useChoir();
  const client = useQueryClient();
  const current = user?.default_choir_id ?? null;
  const [choice, setChoice] = useState<number | null>(
    () => choirs.find((choir) => choir.id === current)?.id ?? null,
  );
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  return (
    <form
      className="form-section form-grid"
      aria-label="Choir preferences"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending || choice === current) return;
        setPending(true);
        try {
          const saved = await setDefaultChoir(choice);
          await client.cancelQueries({ queryKey: ['session'] });
          client.setQueryData<User | null>(['session'], (identity) =>
            identity?.id === saved.id
              ? { ...identity, default_choir_id: saved.default_choir_id }
              : identity,
          );
          setFeedback({ message: 'Default choir saved.' });
        } catch (error) {
          setFeedback({ message: settingsError(error), error: true });
        } finally {
          setPending(false);
        }
      }}
    >
      <label className="field">
        Default choir
        <select
          value={choice ?? ''}
          disabled={pending}
          onChange={(event) => setChoice(event.target.value ? Number(event.target.value) : null)}
        >
          <option value="">No preference</option>
          {choirs.map((choir) => (
            <option key={choir.id} value={choir.id}>
              {choir.name}
            </option>
          ))}
        </select>
      </label>
      <p className="muted full-width">
        Used when you open the workspace in a tab without an active choir selection.
      </p>
      <div className="form-actions">
        <button className="button primary" disabled={pending || choice === current}>
          Save default choir
        </button>
      </div>
      {feedback && (
        <FloatingNotice error={feedback.error} dismiss={() => setFeedback(null)}>
          {feedback.message}
        </FloatingNotice>
      )}
    </form>
  );
}

function Classifications() {
  const confirm = useConfirmation();
  const [kind, setKind] = useState<CategoryKind>('genres');
  return (
    <>
      <p>
        Classifications are shared by every choir. Changes preserve existing hymn and Mass links.
      </p>
      <nav className="settings-tabs" aria-label="Classification settings">
        {categoryKinds.map(([key, label]) => (
          <button
            key={key}
            className={`button ${kind === key ? 'primary' : 'secondary'}`}
            aria-pressed={kind === key}
            onClick={async () => {
              if (kind !== key && (await confirmWorkspaceExit(confirm))) setKind(key);
            }}
          >
            {key === 'mass-placements' ? 'Mass sections' : label}
          </button>
        ))}
      </nav>
      <CategoryManager key={kind} kind={kind} />
    </>
  );
}
function CategoryManager({ kind }: { kind: CategoryKind }) {
  const confirm = useConfirmation();
  const client = useQueryClient();
  const focusTarget = useRef<HTMLElement | null>(null);
  const query = useQuery({
    queryKey: ['category-settings', kind],
    queryFn: () => listCategories(kind),
    refetchOnWindowFocus: false,
  });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [edit, setEdit] = useState<Category | null | undefined>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [action, setAction] = useState<{ row: Category; type: 'toggle' | 'delete' } | null>(null);
  const [order, setOrder] = useState<{ rows: Category[]; ids: number[] } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty =
    order !== null ||
    (edit !== undefined &&
      (name !== (edit?.name ?? '') || description !== (edit?.description ?? '')));
  useUnsavedSettings(dirty);
  const impact = useQuery({
    queryKey: ['category-impact', kind, action?.row.id],
    queryFn: () => categoryImpact(kind, action!.row.id),
    enabled: action !== null,
    refetchOnWindowFocus: false,
  });
  async function refresh() {
    await client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
  }
  async function run(work: () => Promise<unknown>) {
    setPending(true);
    setError('');
    setNotice('');
    try {
      await work();
      await refresh();
      setEdit(undefined);
      setAction(null);
      setOrder(null);
      setNotice('Settings saved.');
    } catch (e) {
      setError(settingsError(e));
    } finally {
      setPending(false);
    }
  }
  function open(row: Category | null) {
    focusTarget.current = document.activeElement as HTMLElement;
    setEdit(row);
    setName(row?.name ?? '');
    setDescription(row?.description ?? '');
    setError('');
  }
  async function close() {
    if (
      !pending &&
      (!dirty || (await confirm('Discard your unsaved settings changes?', 'Discard changes')))
    ) {
      setEdit(undefined);
      setError('');
    }
  }
  const rows = order
    ? order.ids.map((id) => order.rows.find((r) => r.id === id)!)
    : (query.data ?? []);
  const visible = rows.filter(
    (r) =>
      (filter === 'all' || r.is_active === (filter === 'active')) &&
      r.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const filtered = Boolean(search.trim()) || filter !== 'all';
  function move(id: number, by: number) {
    const base = order ?? { rows: [...rows], ids: rows.map((r) => r.id) };
    const ids = [...base.ids];
    const pos = ids.indexOf(id);
    [ids[pos], ids[pos + by]] = [ids[pos + by], ids[pos]];
    setOrder({ ...base, ids });
  }
  const total = Object.values(impact.data?.reference_counts ?? {}).reduce((a, b) => a + b, 0);
  return (
    <section className="form-section settings-manager" aria-label="Category manager">
      <div className="section-heading">
        <h2>
          {kind === 'mass-placements'
            ? 'Mass sections'
            : categoryKinds.find(([k]) => k === kind)?.[1]}
        </h2>
        <button
          className="button primary"
          disabled={pending || Boolean(order)}
          id="add-category"
          onClick={() => open(null)}
        >
          Add category
        </button>
      </div>
      <button
        className="button secondary"
        disabled={pending}
        onClick={async () => {
          if (
            !dirty ||
            (await confirm(
              'Reloading discards unsaved settings changes. Continue?',
              'Reload settings',
            ))
          ) {
            setEdit(undefined);
            setAction(null);
            setOrder(null);
            setError('');
            void query.refetch();
          }
        }}
      >
        Refresh categories
      </button>
      <div className="settings-filters">
        <label className="field">
          Search categories
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="field">
          Status
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>
      {query.isPending && <p role="status">Loading categories…</p>}
      {query.error && (
        <p role="alert">
          {query.error.message} <button onClick={() => void query.refetch()}>Retry</button>
        </p>
      )}
      {notice && <FloatingNotice dismiss={() => setNotice('')}>{notice}</FloatingNotice>}
      {error && edit === undefined && !action && (
        <FloatingNotice error dismiss={() => setError('')}>
          {error}
        </FloatingNotice>
      )}
      {filtered && <p className="tiny">Clear search and choose All to change category order.</p>}
      <ol className="settings-list">
        {visible.map((row) => (
          <li key={row.id} className="settings-row">
            <div className="settings-row-text">
              <strong dir="auto">{row.name}</strong>
              <span className="tiny">{row.is_active ? 'Active' : 'Inactive'}</span>
              {row.description && <p dir="auto">{row.description}</p>}
            </div>
            <div className="settings-row-actions">
              <button
                className="button secondary"
                aria-label={`Move ${row.name} up`}
                disabled={pending || filtered || rows[0]?.id === row.id}
                onClick={() => move(row.id, -1)}
              >
                ↑
              </button>
              <button
                className="button secondary"
                aria-label={`Move ${row.name} down`}
                disabled={pending || filtered || rows.at(-1)?.id === row.id}
                onClick={() => move(row.id, 1)}
              >
                ↓
              </button>
              <button
                className="button secondary"
                disabled={pending || Boolean(order)}
                aria-label={`Edit ${row.name}`}
                onClick={() => open(row)}
              >
                Edit<span className="sr-only"> {row.name}</span>
              </button>
              <button
                className="button secondary"
                disabled={pending || Boolean(order)}
                onClick={() => {
                  setError('');
                  focusTarget.current = document.activeElement as HTMLElement;
                  setAction({ row, type: 'toggle' });
                }}
              >
                {row.is_active ? 'Deactivate' : 'Activate'}
                <span className="sr-only"> {row.name}</span>
              </button>
              <button
                className="button secondary danger"
                aria-label={`Delete ${row.name}`}
                disabled={pending || Boolean(order)}
                onClick={() => {
                  setError('');
                  focusTarget.current = document.activeElement as HTMLElement;
                  setAction({ row, type: 'delete' });
                }}
              >
                Delete<span className="sr-only"> {row.name}</span>
              </button>
            </div>
          </li>
        ))}
      </ol>
      {!query.isPending && !visible.length && <p>No categories match these filters.</p>}
      {order && (
        <div className="form-actions">
          <button
            className="button primary"
            disabled={pending}
            onClick={() => void run(() => reorderCategories(kind, order.rows, order.ids))}
          >
            Save order
          </button>
          <button className="button secondary" disabled={pending} onClick={() => setOrder(null)}>
            Discard order changes
          </button>
        </div>
      )}
      <Dialog.Root
        open={edit !== undefined}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content settings-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              (focusTarget.current?.isConnected
                ? focusTarget.current
                : document.getElementById('add-category')
              )?.focus();
            }}
            aria-describedby="category-edit-description"
          >
            <Dialog.Title>{edit ? 'Edit category' : 'Add category'}</Dialog.Title>
            <Dialog.Description id="category-edit-description">
              Update shared classification details. Saved links and history keep their existing IDs.
            </Dialog.Description>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(() =>
                  saveCategory(kind, edit ?? null, {
                    name: name.trim(),
                    description: description.trim(),
                  }),
                );
              }}
            >
              <label className="field">
                Name{' '}
                <span className="required-marker" aria-hidden="true">
                  *
                </span>
                <input
                  required
                  maxLength={150}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="field">
                Description
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              {error && (
                <p role="alert" className="notice error">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <button className="button primary" disabled={pending || !name.trim()}>
                  Save category
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={pending}
                  onClick={close}
                >
                  Cancel
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setAction(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content settings-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              (focusTarget.current?.isConnected
                ? focusTarget.current
                : document.getElementById('add-category')
              )?.focus();
            }}
          >
            <Dialog.Title>
              {action?.type === 'delete'
                ? 'Delete category?'
                : action?.row.is_active
                  ? 'Deactivate category?'
                  : 'Activate category?'}
            </Dialog.Title>
            <Dialog.Description>
              Existing hymn and program links are preserved when a category is deactivated. Deletion
              is available only for unreferenced categories.
            </Dialog.Description>
            <p>
              <strong dir="auto">{action?.row.name}</strong>
            </p>
            {impact.isPending ? (
              <p role="status">Checking references…</p>
            ) : impact.error ? (
              <p role="alert">
                Unable to check references.{' '}
                <button onClick={() => void impact.refetch()}>Retry</button>
              </p>
            ) : (
              <>
                <dl className="settings-impact">
                  {Object.entries(impact.data?.reference_counts ?? {}).map(([key, count]) => (
                    <div key={key}>
                      <dt>{key.replaceAll('_', ' ')}</dt>
                      <dd>{count}</dd>
                    </div>
                  ))}
                </dl>
                {total > 0 && (
                  <p className="notice">
                    This category has {total} links. Use deactivation to preserve those records.
                  </p>
                )}
              </>
            )}
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                className="button primary"
                disabled={
                  pending ||
                  !impact.data ||
                  Boolean(impact.error) ||
                  (action?.type === 'delete' && total > 0)
                }
                onClick={() =>
                  action &&
                  void run(() =>
                    action.type === 'delete'
                      ? deleteCategory(kind, action.row)
                      : deactivateCategory(kind, action.row),
                  )
                }
              >
                {action?.type === 'delete'
                  ? 'Confirm delete'
                  : action?.row.is_active
                    ? 'Confirm deactivation'
                    : 'Confirm activation'}
              </button>
              <button
                className="button secondary"
                disabled={pending}
                onClick={() => setAction(null)}
              >
                Cancel
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
