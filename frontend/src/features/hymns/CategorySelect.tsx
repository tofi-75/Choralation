/** Searchable checkbox group: keyboard/native semantics and explicit inactive retention. */
import { useId, useState } from 'react';

import type { Category } from '../../api/library';

type Props = {
  label: string;
  choices: Category[];
  value: number[];
  onChange: (ids: number[]) => void;
  error?: string;
  retain?: number[];
  includeInactive?: boolean;
  compact?: boolean;
  required?: boolean;
};
export function CategorySelect({
  label,
  choices,
  value,
  onChange,
  error,
  retain = [],
  includeInactive = false,
  compact = true,
  required = false,
}: Props) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(!compact);
  const isOpen = expanded || Boolean(error);
  const selected = choices.filter((item) => value.includes(item.id));
  const summary = selected.length
    ? `${selected
        .slice(0, 2)
        .map((item) => item.name)
        .join(', ')}${selected.length > 2 ? ` +${selected.length - 2}` : ''}`
    : includeInactive
      ? 'Any'
      : 'None selected';
  const available = choices.filter(
    (item) => includeInactive || item.is_active || retain.includes(item.id),
  );
  const shown = available.filter((item) =>
    item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <fieldset
      className={`category-select ${compact ? 'compact-selector' : ''}`}
      aria-describedby={error ? `${id}-error` : undefined}
      aria-invalid={Boolean(error)}
    >
      <legend className={compact ? 'sr-only' : undefined}>{label}</legend>
      {compact && (
        <button
          type="button"
          className="selector-trigger"
          aria-label={`Choose ${label.toLowerCase()} (${value.length} selected)`}
          aria-expanded={isOpen}
          aria-controls={`${id}-choices`}
          onClick={() => setExpanded(!expanded)}
        >
          <span className="selector-title">
            {label}
            {required && (
              <span className="required-mark" aria-hidden="true">
                {' '}
                *
              </span>
            )}
          </span>
          <span className="selection-summary" title={summary} dir="auto">
            {summary}
          </span>
          <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
        </button>
      )}
      <div id={`${id}-choices`} hidden={!isOpen} className="selector-options">
        <input
          aria-label={`Search ${label.toLowerCase()}`}
          placeholder="Find a category…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="choice-list">
          {shown.map((item) => (
            <label className="checkbox-choice" key={item.id}>
              <input
                type="checkbox"
                checked={value.includes(item.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...value, item.id]
                      : value.filter((valueId) => valueId !== item.id),
                  )
                }
              />
              <span dir="auto">
                {item.name}
                {!item.is_active && <small> (inactive)</small>}
              </span>
            </label>
          ))}
          {!shown.length && <p className="tiny">No matching categories.</p>}
        </div>
        {value.length > 0 && <p className="tiny">{value.length} selected</p>}
        {!!value.length && (
          <button type="button" className="text-button" onClick={() => onChange([])}>
            Clear {label.toLowerCase()}
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
