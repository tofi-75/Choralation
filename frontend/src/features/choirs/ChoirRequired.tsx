import { Link } from 'react-router';

export function ChoirRequired() {
  return (
    <section className="form-section">
      <h2>Choose your choir</h2>
      <p>Select a choir above to see its Masses and hymn counts, or request to join a choir.</p>
      <Link className="button primary" to="/choirs">
        Go to choirs
      </Link>
    </section>
  );
}
