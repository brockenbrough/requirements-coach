'use client';

import { totalLevelsPassed, type MasteryTitleEntry } from '../lib/masteryTitles';
import { CompletedSessionsSummary } from './CompletedSessionsSummary';
import { MasteryProgressSkeleton } from './MasteryProgressSkeleton';
import { MasteryTitleCard } from './MasteryTitleCard';

/**
 * GitHub #39: the profile page's cumulative score + mastery titles section.
 *
 * It used to own its own fetch. That moved to lib/useMasteryProgress.ts once the profile page's
 * title dropdown needed the same entries — see that hook's header for why one shared call beats
 * two components fetching the same uncached endpoints. This component is now purely presentational
 * and the page decides where its data comes from.
 */
export function MasteryProgressSection({
  entries,
  cumulativeScore,
  sessionsCompleted,
  error,
  loading,
  onRetry,
}: {
  entries: MasteryTitleEntry[] | null;
  cumulativeScore: number | null;
  sessionsCompleted: number | null;
  error: string | null;
  loading: boolean;
  onRetry: () => void;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Mastery &amp; Progress</p>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error}
          <button type="button" onClick={onRetry} className="ml-2 font-bold underline hover:text-red-700">
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
          {entries && entries.length === 0 ? (
            // Genuinely possible now that this is course-scoped (GET /api/students/{id}/
            // available-titles), not a fixed set of three: a student enrolled in no course, or
            // in courses with nothing linked yet, sees this instead of an empty list.
            <p className="text-sm font-semibold text-gray-500">
              No mastery titles yet — join a course to see what you can earn.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {(entries ?? []).map((entry) => (
                <MasteryTitleCard key={entry.activityType} entry={entry} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
