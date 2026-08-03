'use client';

import { useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { ACTIVITIES, type Difficulty, questionsForLevel } from '../../../lib/activityContent';
import { useRequireRole } from '../../../lib/useRequireRole';

const LEVEL_LABEL: Record<Difficulty, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const LEVEL_OPTIONS = ['all', 1, 2, 3] as const;

/**
 * Read-only browse of the question bank (GitHub #82, requirement 4: "alle Fragen, alle
 * Quiz-Typen, alle Schwierigkeitsstufen... rein lesend"). Every option renders as a plain div,
 * never a button, and there is no submit/start affordance anywhere on this page — an instructor
 * can see the correct answer and its explanation, not attempt the question.
 */
export default function InstructorQuestionsPage() {
  const { loading, authorized } = useRequireRole('instructor');
  const [activitySlug, setActivitySlug] = useState(ACTIVITIES[0].slug);
  const [level, setLevel] = useState<Difficulty | 'all'>('all');

  if (loading || !authorized) return null;

  const activity = ACTIVITIES.find((item) => item.slug === activitySlug) ?? ACTIVITIES[0];
  const questions = level === 'all' ? activity.questionBank : questionsForLevel(activity, level);

  return (
    <AppShell active="instructor-questions">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">Question Bank</h1>
        <p className="mb-6 max-w-2xl text-sm font-semibold text-gray-500">
          Every question across every activity and difficulty level — read-only, there is nothing here to answer or start.
        </p>

        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap gap-1.5">
            {ACTIVITIES.map((item) => (
              <button
                key={item.slug}
                type="button"
                onClick={() => setActivitySlug(item.slug)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                  activitySlug === item.slug
                    ? 'border-brand-purple bg-brand-purple text-white'
                    : 'border-gray-300 bg-white text-gray-600 hover:border-brand-purple hover:text-brand-purple'
                }`}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {LEVEL_OPTIONS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevel(lvl)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                  level === lvl
                    ? 'border-brand-purple bg-brand-purple text-white'
                    : 'border-gray-300 bg-white text-gray-600 hover:border-brand-purple hover:text-brand-purple'
                }`}
              >
                {lvl === 'all' ? 'All levels' : LEVEL_LABEL[lvl]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {questions.map((question) => (
            <div key={question.id} className="rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
              <span className="mb-3 inline-block rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-gray-500">
                {LEVEL_LABEL[question.difficulty]} · Level {question.difficulty}
              </span>
              <p className="mb-4 text-sm font-bold text-brand-navy">{question.prompt}</p>
              <div className="space-y-2">
                {question.options.map((option) => (
                  <div
                    key={option.id}
                    className={`rounded-brand-md border p-3 ${
                      option.correct ? 'border-brand-teal/40 bg-brand-teal/10' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-semibold ${option.correct ? 'text-brand-teal-dark' : 'text-gray-700'}`}>
                        {option.text}
                      </p>
                      {option.correct ? (
                        <span className="flex-none rounded-full bg-brand-teal/20 px-2 py-0.5 text-[11px] font-extrabold text-brand-teal-dark">
                          Correct
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-xs font-semibold text-gray-500">{option.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
