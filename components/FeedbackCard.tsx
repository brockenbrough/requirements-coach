import type { AnswerOption, Question } from '../lib/activityContent';

function optionClasses(option: AnswerOption, selectedOptionId: string) {
  if (option.correct) return 'border-[#2DD4BF] bg-[#2DD4BF]/15';
  if (option.id === selectedOptionId) return 'border-[#ff6b57] bg-[#ff6b57]/15';
  return 'border-[#332b6b] bg-[#241f52]';
}

export function FeedbackCard({
  question,
  selectedOptionId,
  awardedScore,
  isCorrect,
}: {
  question: Question;
  selectedOptionId: string;
  awardedScore: number;
  isCorrect: boolean;
}) {
  const selectedOption = question.options.find((o) => o.id === selectedOptionId);
  const correctOption = question.options.find((o) => o.correct);
  if (!selectedOption || !correctOption) return null;

  return (
    <div className="rounded-2xl border border-[#332b6b] bg-[#1b1642] p-6">
      <p className="mb-5 text-base font-extrabold leading-snug text-white">{question.prompt}</p>

      <div className="mb-5 flex flex-col gap-2.5">
        {question.options.map((option) => (
          <div key={option.id} className={`flex items-start gap-3 rounded-xl border p-3.5 ${optionClasses(option, selectedOptionId)}`}>
            <span
              className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px] font-extrabold text-white ${
                option.correct ? 'bg-[#2DD4BF]' : option.id === selectedOptionId ? 'bg-[#ff6b57]' : 'border-2 border-[#332b6b]'
              }`}
            >
              {option.correct ? '✓' : option.id === selectedOptionId ? '✕' : ''}
            </span>
            <span className="flex-1 text-sm leading-relaxed text-[#F3F1FF]">{option.text}</span>
            {option.correct ? (
              <span className="flex-none rounded-full bg-[#2DD4BF] px-2.5 py-0.5 text-[11px] font-extrabold text-[#04241f]">
                Correct answer
              </span>
            ) : option.id === selectedOptionId ? (
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

      {!isCorrect ? (
        <div className="mb-3 rounded-xl border border-[#332b6b] bg-[#241f52] p-4 text-sm leading-relaxed text-[#A79FC9]">
          <strong className="mb-1 block font-extrabold text-white">Your pick</strong>
          {selectedOption.explanation}
        </div>
      ) : null}
      <div className="rounded-xl border border-[#332b6b] bg-[#241f52] p-4 text-sm leading-relaxed text-[#A79FC9]">
        <strong className="mb-1 block font-extrabold text-white">{isCorrect ? 'Why this is the weakest' : 'Correct answer'}</strong>
        {correctOption.explanation}
      </div>
    </div>
  );
}
