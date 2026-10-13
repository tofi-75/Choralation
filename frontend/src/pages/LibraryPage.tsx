/** URL owns every applied filter; search debounce is canceled on history/navigation changes. */
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { categoryKinds, fetchHymns } from '../api/library';
import { CategorySelect } from '../features/hymns/CategorySelect';
import { CategoryChips } from '../features/hymns/HymnSummary';
import { useCategories } from '../features/hymns/queries';
import { useSession } from '../features/auth/SessionProvider';
import { UsageSummary } from '../features/hymns/UsageSummary';

const filterNames = {
  genres: 'genres',
  'liturgical-seasons': 'seasons',
  'mass-placements': 'placements',
  languages: 'languages',
  tags: 'tags',
} as const;
export function LibraryPage() {
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const categories = useCategories();
  const query = params.toString();
  const rows = useQuery({ queryKey: ['hymns', query], queryFn: () => fetchHymns(query) });
  const [draftSearch, setDraftSearch] = useState<{ text: string; origin: string } | null>(null);
  const appliedSearch = params.get('q') ?? '';
  const search = draftSearch?.origin === query ? draftSearch.text : appliedSearch;
  useEffect(() => {
    if (!draftSearch || draftSearch.origin !== query || draftSearch.text.trim() === appliedSearch)
      return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(query);
      if (draftSearch.text.trim()) next.set('q', draftSearch.text.trim());
      else next.delete('q');
      next.delete('page');
      setParams(next);
    }, 300);
    return () => clearTimeout(timer);
  }, [draftSearch, query, appliedSearch, setParams]);

  function change(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    if (name !== 'page') next.delete('page');
    setDraftSearch(null);
    setParams(next);
  }
  const filters = categories.data && (
    <div className="filter-grid">
      {categoryKinds.map(([kind, label]) => (
        <CategorySelect
          key={kind}
          label={label}
          choices={categories.data[kind]}
          includeInactive
          value={(params.get(filterNames[kind]) ?? '').split(',').filter(Boolean).map(Number)}
          onChange={(ids) => change(filterNames[kind], ids.join(','))}
        />
      ))}
      <label className="field">
        Active status
        <select
          value={params.get('is_active') ?? 'true'}
          onChange={(event) =>
            change('is_active', event.target.value === 'true' ? '' : event.target.value)
          }
        >
          <option value="true">Active hymns</option>
          <option value="false">Inactive hymns</option>
          <option value="all">All hymns</option>
        </select>
      </label>
      {(['used_after', 'used_before', 'not_used_since'] as const).map((key) => (
        <label className="field" key={key}>
          {
            {
              used_after: 'Used on or after',
              used_before: 'Used on or before',
              not_used_since: 'Not used since',
            }[key]
          }
          <input
            type="date"
            value={params.get(key) ?? ''}
            onChange={(event) => change(key, event.target.value)}
          />
        </label>
      ))}
      <label className="field">
        Usage
        <select
          value={params.get('never_used') ?? ''}
          onChange={(event) => change('never_used', event.target.value)}
        >
          <option value="">Any usage</option>
          <option value="true">Never used</option>
          <option value="false">Previously selected</option>
        </select>
      </label>
    </div>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your shared repertoire</p>
          <h1 className="page-title">Hymn library</h1>
          <p className="muted library-intro">Find hymns for your next gathering.</p>
        </div>
        {user?.role !== 'Viewer' && (
          <Link className="button primary" to="/hymns/new">
            Add hymn
          </Link>
        )}
      </div>
      <section className="library-controls" aria-label="Search and filters">
        <div className="search-row">
          <label className="field search-field">
            <span className="sr-only">Search hymns</span>
            <input
              type="search"
              dir="auto"
              value={search}
              placeholder="Title, composer, source, or tag…"
              onChange={(event) => setDraftSearch({ text: event.target.value, origin: query })}
            />
          </label>
          <label className="field sort-field">
            <span className="sr-only">Sort by</span>
            <select
              value={params.get('ordering') ?? 'title'}
              onChange={(event) =>
                change('ordering', event.target.value === 'title' ? '' : event.target.value)
              }
            >
              <option value="title">Title</option>
              <option value="newest_added">Newest added</option>
              <option value="recently_used">Recently used</option>
              <option value="least_recently_used">Least recently used</option>
              <option value="most_used">Most used</option>
              <option value="least_used">Least used</option>
            </select>
          </label>
          <Dialog.Root>
            <Dialog.Trigger className="button secondary mobile-filter-trigger">
              Filters
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="dialog-content filter-dialog">
                <Dialog.Title>Filter hymns</Dialog.Title>
                <Dialog.Description>Combine classifications across dimensions.</Dialog.Description>
                {filters}
                <Dialog.Close className="button primary">Show results</Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
        {categories.isPending && <p role="status">Loading classifications…</p>}
        {categories.error && (
          <p role="alert">
            {categories.error.message}{' '}
            <button className="button secondary" onClick={() => void categories.refetch()}>
              Retry categories
            </button>
          </p>
        )}
        <details className="desktop-filters">
          <summary>Classification filters</summary>
          {filters}
        </details>
        <div className="applied-filters">
          {Array.from(params.entries())
            .filter(([name]) => name !== 'page' && name !== 'page_size')
            .map(([name, value]) => {
              const kind = categoryKinds.find(([kind]) => filterNames[kind] === name);
              const label =
                kind && categories.data
                  ? value
                      .split(',')
                      .map(
                        (id) =>
                          categories.data[kind[0]].find((item) => item.id === Number(id))?.name ??
                          id,
                      )
                      .join(', ')
                  : value;
              return (
                <button
                  className="chip removable"
                  key={name}
                  onClick={() => change(name, '')}
                  aria-label={`Remove ${name} filter`}
                  title={`${kind?.[1] ?? name}: ${label}`}
                >
                  <span>
                    {kind?.[1] ?? name}:{' '}
                    {name === 'tags' && value.split(',').length > 2
                      ? `${value.split(',').length} selected`
                      : label}
                  </span>{' '}
                  <span aria-hidden="true">×</span>
                </button>
              );
            })}
          {query && (
            <button
              className="text-button"
              onClick={() => {
                setDraftSearch(null);
                setParams({});
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </section>
      {rows.isPending && <p role="status">Loading hymns…</p>}
      {rows.error && (
        <section className="notice error" role="alert">
          <p>{rows.error.message}</p>
          <button className="button secondary" onClick={() => void rows.refetch()}>
            Try again
          </button>
        </section>
      )}
      {rows.data && !rows.error && (
        <>
          <p className="result-count" role="status">
            {rows.data.count} {rows.data.count === 1 ? 'hymn' : 'hymns'}
            {rows.isFetching && ' · Updating…'}
          </p>
          {!rows.data.count && (
            <section className="empty-state">
              <h2>{query ? 'No hymns match these filters.' : 'Your hymn library starts here.'}</h2>
              <p>
                {query
                  ? 'Try fewer classifications or a different search.'
                  : 'Add the hymns your team sings and classify them for future planning.'}
              </p>
              {query && (
                <button
                  className="button secondary"
                  onClick={() => {
                    setDraftSearch(null);
                    setParams({});
                  }}
                >
                  Clear filters
                </button>
              )}
            </section>
          )}
          {!!rows.data.count && (
            <>
              <div className="library-table">
                <table>
                  <caption className="sr-only">Saved hymn library</caption>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Language</th>
                      <th>Usage</th>
                      <th>Genres</th>
                      <th>Placements</th>
                      <th>Seasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.data.results.map((hymn) => (
                      <tr key={hymn.id}>
                        <th scope="row">
                          <Link className="hymn-link" to={`/hymns/${hymn.id}`} dir="auto">
                            {hymn.title}
                          </Link>
                          {!hymn.is_active && <small className="inactive-label">Inactive</small>}
                        </th>
                        <td dir="auto">{hymn.language.name}</td>
                        <td>
                          <UsageSummary hymn={hymn} />
                        </td>
                        <td>
                          <CategoryChips categories={hymn.genres} />
                        </td>
                        <td>
                          <CategoryChips categories={hymn.placements} />
                        </td>
                        <td>
                          {hymn.is_season_neutral && <span className="chip">Season-neutral</span>}
                          <CategoryChips categories={hymn.seasons} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="library-cards">
                {rows.data.results.map((hymn) => (
                  <article key={hymn.id} className="hymn-card">
                    <h2>
                      <Link className="hymn-link" to={`/hymns/${hymn.id}`} dir="auto">
                        {hymn.title}
                      </Link>
                    </h2>
                    <p dir="auto">
                      {hymn.language.name}
                      {!hymn.is_active && ' · Inactive'}
                    </p>
                    <CategoryChips categories={hymn.genres} />
                    <p className="tiny">
                      <UsageSummary hymn={hymn} />
                    </p>
                    <p className="tiny">Placements</p>
                    <CategoryChips categories={hymn.placements} />
                    <p className="tiny">Seasons</p>
                    {hymn.is_season_neutral && <span className="chip">Season-neutral</span>}
                    <CategoryChips categories={hymn.seasons} />
                  </article>
                ))}
              </div>
              <nav className="pagination" aria-label="Library pages">
                <button
                  className="button secondary"
                  disabled={!rows.data.previous}
                  onClick={() => change('page', String(Number(params.get('page') ?? 1) - 1))}
                >
                  Previous
                </button>
                <span>
                  Page {params.get('page') ?? 1} of{' '}
                  {Math.ceil(rows.data.count / Number(params.get('page_size') ?? 25))}
                </span>
                <button
                  className="button secondary"
                  disabled={!rows.data.next}
                  onClick={() => change('page', String(Number(params.get('page') ?? 1) + 1))}
                >
                  Next
                </button>
                <label className="field">
                  Per page
                  <select
                    value={params.get('page_size') ?? '25'}
                    onChange={(event) =>
                      change('page_size', event.target.value === '25' ? '' : event.target.value)
                    }
                  >
                    <option>25</option>
                    <option>50</option>
                    <option>100</option>
                  </select>
                </label>
              </nav>
            </>
          )}
        </>
      )}
    </>
  );
}
