'use client';

/**
 * Display-or-input for one profile field. Purely controlled: the profile page owns whether
 * we're editing (one flag for the whole card, not one per field) and the draft value itself —
 * this component only renders the right markup for the current mode and reports keystrokes
 * back via onChange.
 */
export function EditableField({
  label,
  value,
  editing,
  onChange,
  emptyText = 'Not set',
  inputType = 'text',
  placeholder,
  min,
  max,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange?: (value: string) => void;
  emptyText?: string;
  inputType?: 'text' | 'number' | 'textarea';
  placeholder?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div className="mt-6">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">{label}</p>
      {editing ? (
        inputType === 'textarea' ? (
          <textarea
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            rows={4}
            placeholder={placeholder}
            className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-brand-navy outline-none transition focus:border-brand-purple"
          />
        ) : (
          <input
            type={inputType}
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            min={min}
            max={max}
            placeholder={placeholder}
            className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-brand-navy outline-none transition focus:border-brand-purple"
          />
        )
      ) : (
        <p className="mt-2 text-gray-600">{value || emptyText}</p>
      )}
    </div>
  );
}
