/** Section-scoped choices; season/neutral preference is applied before pagination. */
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { fetchHymns } from '../../api/library';
import type { Categories, Category, Hymn } from '../../api/library';

export function HymnPicker({
  categories,
  restoreFocus,
  placement,
  season,
  selected,
  close,
  add,
}: {
  categories: Categories;
  restoreFocus: () => void;
  placement: Category | null;
  season: number | null;
  selected: number[];
  close: () => void;
  add: (hymn: Hymn) => void;
}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [candidate, setCandidate] = useState<Hymn | null>(null);
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState('');
  const [genre, setGenre] = useState('');
  const [ordering, setOrdering] = useState('title');
  const [allPlacements, setAllPlacements] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const choiceCancel = useRef<HTMLButtonElement>(null);
  const seasonName = categories['liturgical-seasons'].find((row) => row.id === season)?.name;
  useEffect(() => {
    if (candidate) choiceCancel.current?.focus();
    else if (placement) searchInput.current?.focus();
  }, [candidate, placement]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);
  const query = useQuery({
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
    queryFn: () =>
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
      ),
    enabled: Boolean(placement),
  });
  const warnings =
    candidate && placement
      ? [
          !candidate.placements.some((row) => row.id === placement.id)
            ? `Not classified for ${placement.name}.`
            : null,
          season &&
          !candidate.is_season_neutral &&
          !candidate.seasons.some((row) => row.id === season)
            ? `Not classified for ${seasonName ?? 'this season'}.`
            : null,
          selected.includes(candidate.id) ? 'Already selected in this program.' : null,
        ].filter(Boolean)
      : [];
  function choose(hymn: Hymn) {
    add(hymn);
    setCandidate(null);
    close();
  }
  return (
    <Dialog.Root
      open={Boolean(placement)}
      onOpenChange={(open) => {
        if (!open) {
          setCandidate(null);
          close();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content hymn-picker"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus();
          }}
        >
          <Dialog.Title>Add hymn to {placement?.name}</Dialog.Title>
          <Dialog.Description>
            {seasonName ? `Season: ${seasonName}. ` : 'No season selected. '}
            Hymns for {placement?.name}, with season matches and season-neutral hymns first.
          </Dialog.Description>
          {candidate ? (
            <section className="notice" aria-label="Selection warnings">
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
            </section>
          ) : (
            <>
              <label className="field">
                Search hymns
                <input ref={searchInput} value={q} onChange={(event) => setQ(event.target.value)} />
              </label>
              <details className="optional-details mass-filters">
                <summary>Filters and sort</summary>
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
                    <select
                      value={ordering}
                      onChange={(event) => {
                        setOrdering(event.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="title">Title A–Z</option>
                      <option value="newest_added">Newest added</option>
                    </select>
                  </label>
                </div>
              </details>
              {query.isPending && <p role="status">Loading hymns…</p>}
              {query.error && (
                <p role="alert">
                  {query.error.message}{' '}
                  <button className="button secondary" onClick={() => void query.refetch()}>
                    Try again
                  </button>
                </p>
              )}
              <ul className="picker-results">
                {query.data?.results.map((hymn) => (
                  <li key={hymn.id}>
                    <div>
                      <strong dir="auto">{hymn.title}</strong>
                      <p className="tiny">
                        {hymn.language.name} · {hymn.placements.map((row) => row.name).join(', ')}
                        {season &&
                        (hymn.is_season_neutral || hymn.seasons.some((row) => row.id === season))
                          ? hymn.is_season_neutral
                            ? ' · Season-neutral'
                            : ` · ${seasonName}`
                          : season
                            ? ' · Other season'
                            : ''}
                      </p>
                    </div>
                    <button
                      className="button secondary icon-button"
                      aria-label={`Choose ${hymn.title}`}
                      onClick={() => {
                        const mismatch =
                          !hymn.placements.some((row) => row.id === placement?.id) ||
                          (season &&
                            !hymn.is_season_neutral &&
                            !hymn.seasons.some((row) => row.id === season)) ||
                          selected.includes(hymn.id);
                        if (mismatch) setCandidate(hymn);
                        else choose(hymn);
                      }}
                    >
                      <span aria-hidden="true">+</span>
                    </button>
                  </li>
                ))}
              </ul>
              {query.data?.count === 0 && (
                <p>
                  No active hymns match this section and search. You can search all placements under
                  Filters and sort.
                </p>
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
                <Dialog.Close className="button secondary">Close picker</Dialog.Close>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
