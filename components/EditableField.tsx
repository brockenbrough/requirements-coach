'use client';

import { useEffect, useState } from 'react';

/**
 * Display + "Edit X" + input + Save/Cancel, the pattern already used for
 * biography on the profile page — extracted so first/last name, age and
 * semester can reuse it instead of duplicating the edit/save/cancel logic.
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
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-brand-ink outline-none transition focus:border-brand-purple"
            />
          ) : (
            <input
              type={inputType}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              min={min}
              max={max}
              placeholder={placeholder}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-brand-ink outline-none transition focus:border-brand-purple"
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
        <div className="mt-2">
          <p className="text-gray-600">{value || emptyText}</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-3 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 hover:border-brand-purple hover:text-brand-purple"
          >
            Edit {label.toLowerCase()}
          </button>
        </div>
      )}
    </div>
  );
}
