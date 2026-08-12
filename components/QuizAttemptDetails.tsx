'use client';

import { useEffect, useState } from 'react';
import { loadInstructorSessionAnswers, type InstructorQuestionDetail } from '../lib/sessionClient';

/**
 * GitHub #276: the combined Instructor Dashboard's expanded-row detail for a quiz attempt
 * (Identify Weak User Stories / Identify Weak Acceptance Criteria) — every drawn question, its
 * options, and which one the student picked, highlighted correct/incorrect the same way the
 * student's own FeedbackCard does.
 *
 * Fetched on demand: this only mounts once its row is actually expanded (ActivityLogRow only
 * calls renderDetail while expanded is true), so a class-wide list with hundreds of attempts
 * costs one request per row an instructor actually opens, not one per row in the list.
 */
export function QuizAttemptDetails({ sessionId, token }: { sessionId: string; token: string }) {
  const [questions, setQuestions] = useState<InstructorQuestionDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setQuestions(null);
    setError(null);

    loadInstructorSessionAnswers(token, sessionId).then((result) => {
      if (cancelled) return;
      if (result.ok) setQuestions(result.data.questions);
      else setError(result.error);
    });

    return () => {
      cancelled = true;
    };
  }, [token, sessionId]);

  return (
    <div className="space-y-4 rounded-brand-md border border-brand-navy-border bg-brand-navy p-4">
      {error ? (
        <p className="text-sm font-semibold text-brand-danger">{error}</p>
      ) : questions === null ? (
        <p className="text-sm font-semibold text-brand-ink-muted">Loading…</p>
      ) : questions.length === 0 ? (
        <p className="text-sm italic text-brand-ink-muted">No questions were drawn for this attempt.</p>
      ) : (
        questions.map((question) => (
          <div key={question.questionId}>
            <p className="mb-2 text-sm font-extrabold leading-snug text-white">{question.prompt}</p>
            <div className="space-y-1.5">
              {question.options.map((option) => {
                const wasSelected = option.answerId === question.selectedAnswerId;
                return (
                  <div
                    key={option.answerId}
                    className={`rounded-brand-md border px-3 py-2 text-sm leading-relaxed ${
                      wasSelected && option.isCorrect
                        ? 'border-brand-green/50 bg-brand-green/10 text-brand-ink'
                        : wasSelected
                          ? 'border-brand-danger/50 bg-brand-danger/10 text-brand-ink'
                          : option.isCorrect
                            ? 'border-brand-green/30 bg-brand-green/5 text-brand-ink-muted'
                            : 'border-brand-navy-border bg-brand-navy-2 text-brand-ink-muted'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{option.optionText}</span>
                      <span className="flex shrink-0 gap-1.5">
                        {wasSelected ? (
                          <span className="whitespace-nowrap rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide">
                            Selected
                          </span>
                        ) : null}
                        {option.isCorrect ? (
                          <span className="whitespace-nowrap rounded-full bg-brand-green/20 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-brand-green-dark">
                            Correct
                          </span>
                        ) : null}
                      </span>
                    </div>
                    {wasSelected && option.explanation ? (
                      <p className="mt-1.5 text-xs font-semibold text-brand-ink-muted">{option.explanation}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
