'use client';

import { useEffect, useState } from 'react';

/**
 * Same gear glyph as the sidebar Settings icon-button in AppShell.tsx, so
 * "this icon means edit/configure" reads consistently across the app.
 */
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.3.9a7 7 0 0 0-2.1-1.2L14 3h-4l-.5 2.5a7 7 0 0 0-2.1 1.2l-2.3-.9-2 3.5 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.3-.9c.6.5 1.3.9 2.1 1.2L10 21h4l.5-2.5a7 7 0 0 0 2.1-1.2l2.3.9 2-3.5-2-1.5c.1-.4.1-.8.1-1.2Z" />
    </svg>
  );
}

/** Distinct "add a new value" glyph, used only for fields that are still empty. */
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/**
 * Display + icon-triggered edit + input + Save/Cancel, the pattern shared by
 * first/last name, age, semester and biography on the profile page.
 *
 * `onSave` receives the raw input string (even for number fields — the
 * caller parses/validates) and returns an error message to keep the field
 * in edit mode, or null/undefined on success.
 */
export function EditableField({
  label,
  value,
  emptyText = 'Not set',
  inputType = 'text',
  placeholder,
  min,
  max,
  onSave,
}: {
  label: string;
  value: string;
  emptyText?: string;
  inputType?: 'text' | 'number' | 'textarea';
  placeholder?: string;
  min?: number;
  max?: number;
  onSave: (value: string) => Promise<string | null | void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState('');

  useEffect(() => {
    setDraft(value);
  }, [value]);

  async function handleSave() {
    setSaving(true);
    setFieldError('');
    const err = await onSave(draft);
    setSaving(false);
    if (err) {
      setFieldError(err);
      return;
    }
    setEditing(false);
  }

  function handleCancel() {
    setEditing(false);
    setDraft(value);
    setFieldError('');
  }

  const hasValue = value.trim() !== '';

  return (
    <div className="mt-6">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">{label}</p>
      {editing ? (
        <div className="mt-2 space-y-3">
          {inputType === 'textarea' ? (
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={4}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-brand-navy outline-none transition focus:border-brand-purple"
            />
          ) : (
            <input
              type={inputType}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              min={min}
              max={max}
              placeholder={placeholder}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-brand-navy outline-none transition focus:border-brand-purple"
            />
          )}
          {fieldError ? <p className="text-sm font-semibold text-brand-danger">{fieldError}</p> : null}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-brand-purple px-4 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark disabled:opacity-70"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 hover:border-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex items-start justify-between gap-3">
          <p className="text-gray-600">{value || emptyText}</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={hasValue ? `Edit ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
            title={hasValue ? `Edit ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
            className={
              hasValue
                ? 'flex h-8 w-8 flex-none items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-brand-purple hover:text-brand-purple'
                : 'flex h-8 w-8 flex-none items-center justify-center rounded-full border border-brand-purple/40 bg-white text-brand-purple transition hover:border-brand-purple hover:bg-brand-purple hover:text-white'
            }
          >
            {hasValue ? <GearIcon /> : <PlusIcon />}
          </button>
        </div>
      )}
    </div>
  );
}
