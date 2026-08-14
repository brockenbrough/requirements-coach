'use client';

import { useEffect, useState } from 'react';
import { buildMasteryTitleEntries, totalLevelsPassed, type MasteryTitleEntry } from '../lib/masteryTitles';
import { loadStudentScore, loadStudentTitles } from '../lib/sessionClient';
import { CompletedSessionsSummary } from './CompletedSessionsSummary';
import { MasteryProgressSkeleton } from './MasteryProgressSkeleton';
import { MasteryTitleCard } from './MasteryTitleCard';

/**
 * GitHub #39: the profile page's cumulative score + mastery titles section — self-contained (owns
 * its own fetch, loading, and error state), so app/profile/page.tsx just renders it for a student
 * and doesn't otherwise know how it works.
 *
 * Loads GET /api/students/{id}/score and GET /api/students/{id}/titles in parallel (the two
 * endpoints the issue names) and reconciles the titles response with every known activity type
 * via lib/masteryTitles.ts, since the titles route itself only returns entries for activity
 * types the student has actually attempted.
 */
export function MasteryProgressSection({ token, studentId }: { token: string; studentId: string }) {
  const [cumulativeScore, setCumulativeScore] = useState<number | null>(null);
  const [sessionsCompleted, setSessionsCompleted] = useState<number | null>(null);
  const [entries, setEntries] = useState<MasteryTitleEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    Promise.all([loadStudentScore(token, studentId), loadStudentTitles(token, studentId)]).then(
      ([scoreResult, titlesResult]) => {
        if (cancelled) return;

        if (!scoreResult.ok) {
          setError(scoreResult.error);
          return;
        }
        if (!titlesResult.ok) {
          setError(titlesResult.error);
          return;
        }

        setCumulativeScore(scoreResult.data.score);
        setSessionsCompleted(scoreResult.data.sessionsCompleted);
        setEntries(buildMasteryTitleEntries(titlesResult.data.titles));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [token, studentId, loadAttempt]);

  const loading = !error && entries === null;

  return (
    <div className="mt-8 border-t border-gray-100 pt-6">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Mastery &amp; Progress</p>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error}
          <button
            type="button"
            onClick={() => setLoadAttempt((count) => count + 1)}
            className="ml-2 font-bold underline hover:text-red-700"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="mt-3">
          <MasteryProgressSkeleton />
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          <CompletedSessionsSummary
            cumulativeScore={cumulativeScore ?? 0}
            sessionsCompleted={sessionsCompleted ?? 0}
            levelsPassed={totalLevelsPassed(entries ?? [])}
          />
          <div className="space-y-4">
            {(entries ?? []).map((entry) => (
              <MasteryTitleCard key={entry.activityType} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
