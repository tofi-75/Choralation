import { Link, NavLink, useNavigate } from 'react-router';

export function HymnPageActions({ confirmLeave }: { confirmLeave?: () => Promise<boolean> }) {
  const navigate = useNavigate();
  return (
    <div className="hymn-page-actions">
      <Link
        className="button secondary"
        to="/hymns/mine"
        onClick={async (event) => {
          if (!confirmLeave) return;
          event.preventDefault();
          if (await confirmLeave()) navigate('/hymns/mine');
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
