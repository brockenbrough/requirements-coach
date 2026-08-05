'use client';

/**
 * One answer-option row inside QuestionFormModal (GitHub #120/#158): a letter marker, a native radio
 * button to mark this option as the correct one (single-choice, per REQ-PL-6.4 — native input
 * rather than a custom-styled control, so keyboard nav and screen readers work for free), and
 * the option's text field.
 */
export function AnswerOptionField({
  index,
  text,
  isSelected,
  onTextChange,
  onSelect,
}: {
  index: number;
  text: string;
  isSelected: boolean;
  onTextChange: (value: string) => void;
  onSelect: () => void;
}) {
  const letter = String.fromCharCode(65 + index);
  const inputId = `answer-option-${index}`;

  return (
    <div className="mb-2.5 flex items-center gap-2.5">
      <span className="w-5 flex-none text-center text-xs font-extrabold text-brand-ink-muted">{letter}</span>
      <input
        type="radio"
        name="correct-answer"
        id={`${inputId}-radio`}
        checked={isSelected}
        onChange={onSelect}
        className="h-[18px] w-[18px] flex-none accent-brand-teal"
        aria-label={`Mark option ${letter} as the correct answer`}
      />
      <label htmlFor={inputId} className="sr-only">
        Answer option {letter}
      </label>
      <input
        type="text"
        id={inputId}
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder={`Answer option ${letter}…`}
        className="flex-1 rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple"
      />
    </div>
  );
}
