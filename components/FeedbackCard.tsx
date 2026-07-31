import type { SessionQuestionOption } from '../lib/sessionClient';

// The option list comes from the session question, but which one is correct — and why —
// comes from the feedback route, because the server withholds that until the answer is
// committed. Hence ids rather than a flag on the option itself.
function optionClasses(answerId: string, selectedAnswerId: string, correctAnswerId: string) {
  if (answerId === correctAnswerId) return 'border-[#2DD4BF] bg-[#2DD4BF]/15';
  if (answerId === selectedAnswerId) return 'border-[#ff6b57] bg-[#ff6b57]/15';
  return 'border-[#332b6b] bg-[#241f52]';
}

export function FeedbackCard({
  prompt,
  options,
  selectedAnswerId,
  correctAnswerId,
  selectedExplanation,
  correctExplanation,
  awardedScore,
  isCorrect,
}: {
  prompt: string;
  options: SessionQuestionOption[];
  selectedAnswerId: string;
  /** Equal to selectedAnswerId when the pick was right. */
  correctAnswerId: string;
  selectedExplanation: string | null;
  correctExplanation: string | null;
  awardedScore: number;
  isCorrect: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#332b6b] bg-[#1b1642] p-6">
      <p className="mb-5 text-base font-extrabold leading-snug text-white">{prompt}</p>

      <div className="mb-5 flex flex-col gap-2.5">
        {options.map((option) => (
          <div
            key={option.answer_id}
            className={`flex items-start gap-3 rounded-xl border p-3.5 ${optionClasses(option.answer_id, selectedAnswerId, correctAnswerId)}`}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px] font-extrabold text-white ${
                option.answer_id === correctAnswerId
                  ? 'bg-[#2DD4BF]'
                  : option.answer_id === selectedAnswerId
                    ? 'bg-[#ff6b57]'
                    : 'border-2 border-[#332b6b]'
              }`}
            >
              {option.answer_id === correctAnswerId ? '✓' : option.answer_id === selectedAnswerId ? '✕' : ''}
            </span>
            <span className="flex-1 text-sm leading-relaxed text-[#F3F1FF]">{option.option_text}</span>
            {option.answer_id === correctAnswerId ? (
              <span className="flex-none rounded-full bg-[#2DD4BF] px-2.5 py-0.5 text-[11px] font-extrabold text-[#04241f]">
                Correct answer
              </span>
            ) : option.answer_id === selectedAnswerId ? (
              <span className="flex-none rounded-full bg-[#ff6b57] px-2.5 py-0.5 text-[11px] font-extrabold text-white">Your answer</span>
            ) : null}
          </div>
        ))}
      </div>

      <div className={`mb-4 rounded-2xl p-6 text-center ${isCorrect ? 'bg-gradient-to-br from-[#0f6d5c] to-[#241f52]' : 'bg-gradient-to-br from-[#7a2c22] to-[#241f52]'}`}>
        <h2 className="text-xl font-extrabold text-white">{isCorrect ? 'Correct!' : 'Not quite'}</h2>
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#FFD666]/15 px-3.5 py-1.5 text-sm font-extrabold text-[#FFD666]">
          +{awardedScore} pts
        </span>
      </div>

      {/* answer.explanation is nullable in the schema, so each block only renders when there is something to say. */}
      {!isCorrect && selectedExplanation ? (
        <div className="mb-3 rounded-xl border border-[#332b6b] bg-[#241f52] p-4 text-sm leading-relaxed text-[#A79FC9]">
          <strong className="mb-1 block font-extrabold text-white">Your pick</strong>
          {selectedExplanation}
        </div>
      ) : null}
      {correctExplanation ? (
        <div className="rounded-xl border border-[#332b6b] bg-[#241f52] p-4 text-sm leading-relaxed text-[#A79FC9]">
          <strong className="mb-1 block font-extrabold text-white">{isCorrect ? 'Why this is the weakest' : 'Correct answer'}</strong>
          {correctExplanation}
        </div>
      ) : null}
    </div>
  );
}
