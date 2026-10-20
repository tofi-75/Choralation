/** Decorative icons; the surrounding control supplies its accessible name. */
export function PlannerIcon({
  name,
}: {
  name: 'up' | 'down' | 'edit' | 'remove' | 'calendar' | 'shuffle';
}) {
  const paths = {
    calendar: 'M4 5h16v16H4zM8 3v4M16 3v4M4 10h16',
    shuffle:
      'M3 5h3c5 0 7 14 12 14h3m-4-4 4 4-4 4M3 19h3c2 0 4-3 6-7m2-4c1-2 3-3 4-3h3m-4-4 4 4-4 4',
    up: 'm6 14 6-6 6 6',
    down: 'm6 10 6 6 6-6',
    edit: 'm15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z',
    remove: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
  };
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
