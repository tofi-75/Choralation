/** Shared saved classification labels; inactive relationships remain visible. */
import type { Category } from '../../api/library';
import { useState } from 'react';

export function CategoryChips({ categories }: { categories: Category[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? categories : categories.slice(0, 3);
  return (
    <span className="chip-list">
      {shown.map((item) => (
        <span key={item.id} className={`chip ${item.is_active ? '' : 'inactive'}`} dir="auto">
          {item.name}
          {!item.is_active && ' (inactive)'}
        </span>
      ))}
      {!categories.length && <span className="muted">—</span>}
      {categories.length > 3 && (
        <button
          type="button"
          className="text-button chip-expander"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show fewer' : `Show ${categories.length - 3} more`}
        </button>
      )}
    </span>
  );
}
