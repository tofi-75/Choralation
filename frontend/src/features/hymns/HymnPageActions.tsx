import { Link, NavLink } from 'react-router';

export function HymnPageActions({ confirmLeave }: { confirmLeave?: () => boolean }) {
  return (
    <div className="hymn-page-actions">
      <Link
        className="button secondary"
        to="/hymns/mine"
        onClick={(event) => {
          if (confirmLeave && !confirmLeave()) event.preventDefault();
        }}
      >
        My hymns
      </Link>
      <NavLink className="button primary" to="/hymns/new" end>
        Add hymn
      </NavLink>
    </div>
  );
}
