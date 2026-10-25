import { useChoirQuery } from '../features/choirs/useChoirQuery';
/** The first screen puts the next saved program and recent repertoire within reach. */

import { Link } from 'react-router';
import { fetchHymns } from '../api/library';
import { fetchMasses } from '../api/masses';
import { useSession } from '../features/auth/SessionProvider';
import { useChoir } from '../features/choirs/ChoirProvider';
import { ChoirRequired } from '../features/choirs/ChoirRequired';

export function WorkspacePage() {
  const { user } = useSession();
  const { active } = useChoir();
  const masses = useChoirQuery({
    queryKey: ['masses', 'home'],
    queryFn: (choirId) => fetchMasses('status=finalized&archived=false', choirId),
    enabled: Boolean(active),
  });
  const hymns = useChoirQuery({
    queryKey: ['hymns', 'home'],
    queryFn: (choirId) => fetchHymns('ordering=newest_added', choirId),
  });
  return (
    <>
      <div className="page-heading home-heading">
        <div>
          <p className="eyebrow">Your team, in harmony</p>
          <h1 className="page-title">Masses</h1>
        </div>
        <div className="form-actions">
          <Link className="button secondary" to="/masses?status=draft">
            Drafts
          </Link>
          <Link className="button secondary" to="/masses">
            All Masses
          </Link>
        </div>
      </div>
      <section aria-label="Upcoming Masses" className="home-section">
        {!active ? (
          <ChoirRequired />
        ) : (
          <>
            <h2>Next Mass</h2>
            {masses.isPending && <p role="status">Loading upcoming Masses…</p>}
            {masses.error && (
              <p role="alert">
                Unable to load upcoming Masses.{' '}
                <button className="text-button" onClick={() => void masses.refetch()}>
                  Try again
                </button>
              </p>
            )}
            {masses.data && !masses.data.count && (
              <p className="notice">No upcoming saved Masses. Prepare a draft to get started.</p>
            )}
            <div className="mass-list upcoming-masses">
              {masses.data?.results.slice(0, 4).map((mass, index) => (
                <Link
                  key={mass.id}
                  className={`mass-card ${index === 0 ? 'next-mass' : ''}`}
                  to={`/masses/${mass.id}`}
                >
                  {index === 1 && <span className="eyebrow">Coming up</span>}
                  <time dateTime={mass.date}>{mass.date}</time>
                  <h3 dir="auto">{mass.title}</h3>
                  <p className="tiny">
                    {mass.liturgical_season?.name ?? 'No season selected'} · {mass.selection_count}{' '}
                    hymns
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>
      <section className="home-section" aria-labelledby="new-hymns-heading">
        <div className="section-heading">
          <h2 id="new-hymns-heading">New hymns</h2>
          <div className="form-actions">
            <Link className="button secondary" to="/hymns">
              All hymns
            </Link>
            {user?.role !== 'Viewer' && (
              <Link className="button primary" to="/hymns/new">
                Add hymn
              </Link>
            )}
          </div>
        </div>
        {hymns.isPending && <p role="status">Loading new hymns…</p>}
        {hymns.error && (
          <p role="alert">
            Unable to load new hymns.{' '}
            <button className="text-button" onClick={() => void hymns.refetch()}>
              Try again
            </button>
          </p>
        )}
        {hymns.data?.count === 0 && <p className="muted">Newly added hymns will appear here.</p>}
        <ul className="recent-hymns">
          {hymns.data?.results.slice(0, 4).map((hymn) => (
            <li key={hymn.id}>
              <Link to={`/hymns/${hymn.id}`} dir="auto">
                {hymn.title}
              </Link>
              <span className="tiny muted">{hymn.language.name}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="home-section practice-placeholder" aria-labelledby="practice-heading">
        <h2 id="practice-heading">Practice</h2>
        <span className="coming-soon">Coming soon</span>
      </section>
    </>
  );
}
