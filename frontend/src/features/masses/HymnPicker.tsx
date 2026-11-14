import * as Dialog from '@radix-ui/react-dialog';
import { useChoirQuery } from '../choirs/useChoirQuery';
/** Section-scoped choices; season/neutral preference is applied before pagination. */

import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { hasSeasonMismatch, seasonLabel } from './seasonSuitability';

import { fetchHymns } from '../../api/library';
import type { Categories, Category, Hymn } from '../../api/library';

const columns = [
  ['title', 'Title'],
  ['language', 'Language'],
  ['seasons', 'Seasons'],
  ['genres', 'Genres'],
  ['tags', 'Tags'],
  ['key', 'Key'],
  ['duration', 'Minutes'],
  ['voices', 'Voices'],
] as const;
const categoryNames = (rows: Category[]) =>
  rows
    .map((row) => row.name)
    .sort()
    .join(', ') || '—';

/** Render one accessible result layout; a wide table would be awkward on phones. */
function useDesktopResults() {
  const [wide, setWide] = useState(
    () => window.matchMedia?.('(min-width: 768px)').matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.('(min-width: 768px)');
    if (!media) return;
    const update = () => setWide(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return wide;
}

export function selectionWarnings(
  hymn: Hymn,
  placement: Category | null,
  season: number | null,
  seasonName: string | undefined,
  selected: number[],
) {
  if (!placement) return [];
  const warnings = [];
  if (!hymn.placements.some((row) => row.id === placement.id))
    warnings.push(`Not classified for ${placement.name}.`);
  if (hasSeasonMismatch(hymn, season))
    warnings.push(
      `Classified for ${seasonLabel(hymn)}; this Mass is ${seasonName ?? 'a different season'}.`,
    );
  if (selected.includes(hymn.id)) warnings.push('Already selected in this program.');
  return warnings;
}

export function HymnPicker({
  categories,
  restoreFocus,
  placement,
  season,
  selected,
  close,
  add,
  create,
  initialSearch = '',
  initialCandidate = null,
}: {
  categories: Categories;
  restoreFocus: () => void;
  placement: Category | null;
  season: number | null;
  selected: number[];
  close: () => void;
  add: (hymn: Hymn) => void;
  create?: (search: string) => void;
  initialSearch?: string;
  initialCandidate?: Hymn | null;
}) {
  const desktop = useDesktopResults();
  const [q, setQ] = useState(initialSearch);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [candidate, setCandidate] = useState<Hymn | null>(initialCandidate);
  const [search, setSearch] = useState(initialSearch);
  const [language, setLanguage] = useState('');
  const [genre, setGenre] = useState('');
  const [ordering, setOrdering] = useState('title');
  const [allPlacements, setAllPlacements] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const choiceCancel = useRef<HTMLButtonElement>(null);
  const seasonName = categories['liturgical-seasons'].find((row) => row.id === season)?.name;
  useEffect(() => {
    if (!candidate && placement) searchInput.current?.focus();
  }, [candidate, placement]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);
  const query = useChoirQuery({
    queryKey: [
      'hymns',
      'picker',
      placement?.id,
      season,
      allPlacements,
      search,
      language,
      genre,
      ordering,
      page,
    ],
    queryFn: (choirId) =>
      fetchHymns(
        new URLSearchParams({
          q: search,
          page: String(page),
          ordering,
          ...(!allPlacements && placement ? { placements: String(placement.id) } : {}),
          ...(season ? { preferred_season: String(season) } : {}),
          ...(language ? { languages: language } : {}),
          ...(genre ? { genres: genre } : {}),
        }).toString(),
        choirId,
      ),
    enabled: Boolean(placement),
  });
  const emptyResults = query.isSuccess && !query.isFetching && query.data.count === 0;
  const emptySearch = emptyResults && q === search && Boolean(search.trim());
  // Only offer to create a hymn when the whole shared library has no match, not just this view.
  const narrowed = !allPlacements || Boolean(language || genre);
  const library = useChoirQuery({
    queryKey: ['hymns', 'picker-unfiltered', search],
    queryFn: (choirId) => fetchHymns(new URLSearchParams({ q: search }).toString(), choirId),
    enabled: Boolean(create) && emptySearch && narrowed,
  });
  const libraryEmpty = narrowed
    ? library.isSuccess && !library.isFetching && library.data.count === 0
    : emptySearch;
  const warnings = candidate
    ? selectionWarnings(candidate, placement, season, seasonName, selected)
    : [];
  function refineSearch(event: MouseEvent<HTMLButtonElement>, update: () => void) {
    update();
    setPage(1);
    // Keyboard activation unmounts the focused button, so return focus to the search box.
    if (event.detail === 0) searchInput.current?.focus();
  }
  function changeOrdering(value: string) {
    setOrdering(value);
    setPage(1); // The API sorts the entire filtered result set, not just this page.
  }
  function choiceButton(hymn: Hymn) {
    return (
      <button
        className="button secondary icon-button"
        aria-label={`Choose ${hymn.title}`}
        onClick={() => {
          if (selectionWarnings(hymn, placement, season, seasonName, selected).length)
            setCandidate(hymn);
          else choose(hymn);
        }}
      >
        <span aria-hidden="true">+</span>
      </button>
    );
  }
  function extraMetadata(hymn: Hymn) {
    return [
      hymn.sheet_music_pdf || hymn.sheet_music_url ? 'Sheet music' : null,
      selected.includes(hymn.id) ? 'Already selected' : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  function choose(hymn: Hymn) {
    add(hymn);
    setCandidate(null);
    closePicker();
  }
  function closePicker() {
    close();
    restoreFocus();
  }
  return (
    <section
      id={`picker-${placement?.id}`}
      className="inline-hymn-picker"
      aria-label={`Add hymn to ${placement?.name}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !candidate) {
          event.stopPropagation();
          closePicker();
        }
      }}
    >
      <h3 className="sr-only">Add hymn to {placement?.name}</h3>
      <p className="tiny picker-preference">
        {seasonName ? `${seasonName} / neutral first` : 'Section matches first'}
      </p>
      {candidate ? (
        <Dialog.Root
          open
          onOpenChange={(open) => {
            if (!open) setCandidate(null);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content
              className="dialog-content"
              aria-describedby={undefined}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                choiceCancel.current?.focus();
              }}
            >
              <Dialog.Title>Selection warnings</Dialog.Title>
              <h3 dir="auto">{candidate.title}</h3>
              <ul>
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              <p>You can still use this hymn. Add it to {placement?.name}?</p>
              <div className="form-actions">
                <button
                  ref={choiceCancel}
                  className="button secondary"
                  onClick={() => setCandidate(null)}
                >
                  Cancel choice
                </button>
                <button className="button primary" onClick={() => choose(candidate)}>
                  Add anyway
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : (
        <>
          <div className="picker-toolbar">
            <label className="field">
              <span className="sr-only">Search hymns</span>
              <input
                type="search"
                placeholder="Search hymns"
                ref={searchInput}
                value={q}
                onChange={(event) => setQ(event.target.value)}
              />
            </label>
            <button
              className="button secondary"
              aria-expanded={filtersOpen}
              aria-controls={`picker-filters-${placement?.id}`}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              Filters
            </button>
          </div>
          {filtersOpen && (
            <div id={`picker-filters-${placement?.id}`} className="picker-filters">
              <div className="form-grid">
                <label className="checkbox-choice full-width">
                  <input
                    type="checkbox"
                    checked={allPlacements}
                    onChange={(event) => {
                      setAllPlacements(event.target.checked);
                      setPage(1);
                    }}
                  />
                  Search all placements
                </label>
                <label className="field">
                  Language filter
                  <select
                    value={language}
                    onChange={(event) => {
                      setLanguage(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All languages</option>
                    {categories.languages.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                        {!row.is_active && ' (inactive)'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Genre filter
                  <select
                    value={genre}
                    onChange={(event) => {
                      setGenre(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All genres</option>
                    {categories.genres.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                        {!row.is_active && ' (inactive)'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Sort hymns
                  <select value={ordering} onChange={(event) => changeOrdering(event.target.value)}>
                    {columns.flatMap(([value, label]) => [
                      <option key={value} value={value}>
                        {label} ↑
                      </option>,
                      <option key={`-${value}`} value={`-${value}`}>
                        {label} ↓
                      </option>,
                    ])}
                    <option value="newest_added">Newest added</option>
                  </select>
                </label>
              </div>
            </div>
          )}
          <div role="status">
            {(query.isFetching || q !== search) && 'Loading hymns…'}
            {emptyResults && q === search && 'No active hymns match the current filters.'}
            {query.isSuccess && !query.isFetching && q === search && query.data.count > 0 && (
              <span className="sr-only">
                {query.data.count === 1 ? '1 hymn found.' : `${query.data.count} hymns found.`}
              </span>
            )}
          </div>
          {query.error && (
            <p role="alert">
              {query.error.message}{' '}
              <button className="button secondary" onClick={() => void query.refetch()}>
                Try again
              </button>
            </p>
          )}
          {emptySearch && (
            <div className="form-actions picker-empty-actions">
              {create && libraryEmpty && (
                <button className="button primary" onClick={() => create(search.trim())}>
                  Hymn not found, add hymn?
                </button>
              )}
              {create && narrowed && library.isFetching && (
                <span role="status">Checking all placements…</span>
              )}
              {create && narrowed && library.error && (
                <button className="button secondary" onClick={() => void library.refetch()}>
                  Retry library search
                </button>
              )}
              {!allPlacements && (
                <button
                  className="button secondary"
                  onClick={(event) => refineSearch(event, () => setAllPlacements(true))}
                >
                  Search all placements
                </button>
              )}
              {allPlacements && (language || genre) && (
                <button
                  className="button secondary"
                  onClick={(event) =>
                    refineSearch(event, () => {
                      setLanguage('');
                      setGenre('');
                    })
                  }
                >
                  Clear language and genre filters
                </button>
              )}
            </div>
          )}
          {query.data?.count === 0 ? null : desktop ? (
            <div
              className="picker-table-scroll picker-result-scroll"
              tabIndex={0}
              role="region"
              aria-label="Hymn choices"
            >
              <table className="picker-table">
                <caption className="sr-only">
                  Hymn suggestions. Season matches and any-season hymns come first, then the
                  selected column order.
                </caption>
                <colgroup>
                  {[
                    'title',
                    'language',
                    'seasons',
                    'genres',
                    'tags',
                    'key',
                    'duration',
                    'voices',
                    'add',
                  ].map((column) => (
                    <col key={column} className={`picker-column-${column}`} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {columns.map(([value, label]) => (
                      <th
                        key={value}
                        scope="col"
                        aria-sort={
                          ordering === value
                            ? 'ascending'
                            : ordering === `-${value}`
                              ? 'descending'
                              : 'none'
                        }
                      >
                        <button
                          aria-label={`Sort by ${label}`}
                          onClick={() => changeOrdering(ordering === value ? `-${value}` : value)}
                        >
                          {label}{' '}
                          <span aria-hidden="true">
                            {ordering === value ? '↑' : ordering === `-${value}` ? '↓' : '↕'}
                          </span>
                        </button>
                      </th>
                    ))}
                    <th scope="col">
                      <span className="sr-only">Add hymn</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {query.data?.results.map((hymn) => (
                    <tr key={hymn.id} className="picker-result-row">
                      <td
                        title={[hymn.title, categoryNames(hymn.placements), extraMetadata(hymn)]
                          .filter(Boolean)
                          .join(' · ')}
                      >
                        <strong dir="auto">{hymn.title}</strong>
                        <p className="tiny">{categoryNames(hymn.placements)}</p>
                        {extraMetadata(hymn) && <p className="tiny">{extraMetadata(hymn)}</p>}
                      </td>
                      <td title={hymn.language.name}>{hymn.language.name}</td>
                      <td title={seasonLabel(hymn)}>{seasonLabel(hymn)}</td>
                      <td title={categoryNames(hymn.genres)}>{categoryNames(hymn.genres)}</td>
                      <td title={categoryNames(hymn.tags)}>{categoryNames(hymn.tags)}</td>
                      <td title={hymn.default_key || '—'}>{hymn.default_key || '—'}</td>
                      <td>
                        {hymn.estimated_duration_minutes
                          ? Number(hymn.estimated_duration_minutes)
                          : '—'}
                      </td>
                      <td title={hymn.voices.join(', ') || '—'}>{hymn.voices.join(', ') || '—'}</td>
                      <td>{choiceButton(hymn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul
              className="picker-results picker-result-scroll"
              aria-label="Hymn choices"
              tabIndex={0}
            >
              {query.data?.results.map((hymn) => (
                <li key={hymn.id} className="picker-result-row">
                  <div>
                    <strong dir="auto">{hymn.title}</strong>
                    <p className="tiny">
                      {hymn.language.name} · {categoryNames(hymn.placements)} · {seasonLabel(hymn)}
                    </p>
                    <p className="tiny picker-metadata">
                      {[
                        ...hymn.genres.map((row) => row.name),
                        ...hymn.tags.map((row) => row.name),
                        hymn.default_key ? `Key ${hymn.default_key}` : null,
                        hymn.estimated_duration_minutes
                          ? `${Number(hymn.estimated_duration_minutes)} min`
                          : null,
                        hymn.is_polyphonic
                          ? `Polyphony${hymn.voices.length ? `: ${hymn.voices.join(', ')}` : ''}`
                          : null,
                        extraMetadata(hymn),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {choiceButton(hymn)}
                </li>
              ))}
            </ul>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={!query.data?.previous}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <span>Page {page}</span>
            <button
              className="button secondary"
              disabled={!query.data?.next}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
            <button className="button secondary" onClick={closePicker}>
              Close picker
            </button>
          </div>
        </>
      )}
    </section>
  );
}
