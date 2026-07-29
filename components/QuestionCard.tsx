'use client';

import { useState } from 'react';
import type { Question } from '../lib/activityContent';

export function QuestionCard({
  question,
  onSubmit,
}: {
  question: Question;
  onSubmit: (optionId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-[#332b6b] bg-[#1b1642] p-6">
      <p className="mb-5 text-base font-extrabold leading-snug text-white">{question.prompt}</p>

      <div className="mb-5 flex flex-col gap-2.5">
        {question.options.map((option) => {
          const isChecked = selected === option.id;
          return (
            <label
              key={option.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
                isChecked ? 'border-[#7C4DFF] bg-[#7C4DFF]/15' : 'border-[#332b6b] bg-[#241f52] hover:border-[#8b5cf6]/60'
              }`}
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                value={option.id}
                checked={isChecked}
                onChange={() => setSelected(option.id)}
                className="sr-only"
              />
              <span
                className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${
                  isChecked ? 'border-[#7C4DFF] bg-[#7C4DFF]' : 'border-[#332b6b]'
                }`}
              >
                {isChecked ? <span className="text-[10px] font-extrabold text-white">✓</span> : null}
              </span>
              <span className="text-sm leading-relaxed text-[#F3F1FF]">{option.text}</span>
            </label>
          );
        })}
      </div>

      <button
        type="button"
        disabled={!selected}
        onClick={() => selected && onSubmit(selected)}
        className="w-full rounded-xl bg-[#7C4DFF] py-3 text-sm font-extrabold text-white transition hover:bg-[#6234d1] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Submit
      </button>
    </div>
  );
}
