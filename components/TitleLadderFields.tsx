'use client';

import { useId } from 'react';
import { DIFFICULTY_OPTIONS } from '../lib/difficultyLevels';
import { MAX_DIFFICULTY_LEVEL } from '../lib/sessionRules';

/** The ladder as the form holds it: one string per level, '' meaning "no title on this rung". */
export type TitleLadderDraft = Record<number, string>;

/** An empty draft — every level present, every value blank. */
export function emptyTitleLadderDraft(): TitleLadderDraft {
  return Object.fromEntries(
    Array.from({ length: MAX_DIFFICULTY_LEVEL }, (_, index) => [index + 1, '']),
  ) as TitleLadderDraft;
}

/** Turns a draft into the payload the API takes — '' becomes null, i.e. "clear this rung". */
export function titleLadderDraftToRungs(draft: TitleLadderDraft) {
  return Array.from({ length: MAX_DIFFICULTY_LEVEL }, (_, index) => {
    const difficultyLevel = index + 1;
    const value = (draft[difficultyLevel] ?? '').trim();
    return { difficultyLevel, titleName: value === '' ? null : value };
  });
}

/**
 * One text field per difficulty level for a catalog's mastery titles, shared by
 * CreateCatalogModal (authoring at creation) and the catalog detail page (editing afterwards) so
 * the two can't drift on level labels or on what an empty field means.
 *
 * The "type a new title or pick an existing one" half of the story is a native <datalist> rather
 * than a separate picker control: one input then does both jobs, keyboard and mobile behaviour come
 * for free, and there is no state to keep in sync between a dropdown and a text field. `suggestions`
 * comes from GET /api/instructor/titles — every name already in use anywhere, since consistent
 * naming across catalogs is the point.
 *
 * Leaving fields empty is always allowed. A catalog with no ladder is the state every catalog is in
 * today, and lib/masteryTitles.ts renders an untitled rung as a plain "Level N".
 */
export function TitleLadderFields({
  draft,
  onChange,
  suggestions,
  disabled = false,
  tone = 'light',
}: {
  draft: TitleLadderDraft;
  onChange: (difficultyLevel: number, value: string) => void;
  suggestions: string[];
  disabled?: boolean;
  /** 'dark' for the navy modal surfaces, 'light' for the white instructor pages. */
  tone?: 'dark' | 'light';
}) {
  // useId so two instances on one page can't share a datalist element id.
  const listId = useId();

  const inputClass =
    tone === 'dark'
      ? 'mt-1.5 block w-full rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple disabled:opacity-60'
      : 'mt-1.5 block w-full rounded-brand-md border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-brand-navy outline-none transition focus:border-brand-purple disabled:opacity-60';

  const labelClass =
    tone === 'dark'
      ? 'block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted'
      : 'block text-xs font-extrabold uppercase tracking-wide text-gray-400';

  return (
    <div className="grid gap-3">
      <datalist id={listId}>
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {DIFFICULTY_OPTIONS.map((option) => (
        <label key={option.value} className={labelClass}>
          {option.label}
          <input
            type="text"
            list={listId}
            value={draft[option.value] ?? ''}
            onChange={(event) => onChange(option.value, event.target.value)}
            disabled={disabled}
            placeholder="e.g. Story Apprentice"
            className={inputClass}
          />
        </label>
      ))}
    </div>
  );
}
