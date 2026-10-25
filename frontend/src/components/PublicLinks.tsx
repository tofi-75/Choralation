/** Real document links: public information is served independently of auth/React. */
export function PublicLinks() {
  return (
    <nav className="public-links" aria-label="Information">
      <a href="/about">About</a>
      <a href="/privacy">Privacy policy</a>
      <a href="/terms">Terms of use</a>
    </nav>
  );
}
