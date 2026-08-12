import type { CompletedAttempt } from '../lib/sessionClient';

const DIFFICULTY_LABEL: Record<number, string> = {
  1: 'Easy',
  2: 'Medium',
  3: 'Hard',
};

/**
 * The "list of prior results for the activity" an activity's landing page shows (REQ-PL-2.8),
 * shared by app/activities/[slug]/page.tsx (Type A) and app/activities/write-acceptance-criteria/
 * page.tsx — both read the same GET /api/sessions/completed shape via loadCompletedAttempts, so
 * there is one table implementation instead of two copies drifting apart.
 *
 * attempts === null renders a loading skeleton in the same shape as the real table (GitHub #80)
 * instead of popping in abruptly once the request resolves. showLevel hides the level column for
 * Write Acceptance Criteria, which doesn't have real difficulty progression yet — every session
 * is drawn at the same starting level, so a level column there would just repeat "Easy · 1" down
 * the whole list.
 */
export function CompletedAttemptsTable({
  attempts,
  showLevel = true,
}: {
  attempts: CompletedAttempt[] | null;
  showLevel?: boolean;
}) {
  const columnCount = showLevel ? 4 : 3;

  return (
    <div className="mt-6">
      <h3 className="mb-3 text-sm font-extrabold text-gray-500">Previous attempts</h3>

      {attempts === null ? (
        <div className="overflow-x-auto rounded-2xl border border-brand-navy-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-navy text-brand-ink-muted">
                <th className="px-4 py-2.5 text-left font-bold">Date</th>
                {showLevel ? <th className="px-4 py-2.5 text-left font-bold">Level</th> : null}
                <th className="px-4 py-2.5 text-left font-bold">Score</th>
                <th className="px-4 py-2.5 text-left font-bold">Result</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2].map((i) => (
                <tr key={i} className="border-t border-brand-navy-border bg-brand-navy-2">
                  {Array.from({ length: columnCount }).map((_, col) => (
                    <td key={col} className="px-4 py-3">
                      <span className="block h-3 w-16 animate-pulse rounded-full bg-white/10" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : attempts.length === 0 ? (
        <p className="rounded-brand-lg border border-gray-100 bg-gray-50 p-4 text-sm font-semibold text-gray-500">
          You haven&apos;t completed this activity yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-brand-navy-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-navy text-brand-ink-muted">
                <th className="px-4 py-2.5 text-left font-bold">Date</th>
                {showLevel ? <th className="px-4 py-2.5 text-left font-bold">Level</th> : null}
                <th className="px-4 py-2.5 text-left font-bold">Score</th>
                <th className="px-4 py-2.5 text-left font-bold">Result</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => (
                <tr key={attempt.sessionId} className="border-t border-brand-navy-border bg-brand-navy-2 text-brand-ink">
                  <td className="px-4 py-2.5">
                    {attempt.completedAt ? new Date(attempt.completedAt).toLocaleDateString() : '—'}
                  </td>
                  {showLevel ? (
                    <td className="px-4 py-2.5">
                      {DIFFICULTY_LABEL[attempt.difficultyLevel] ?? 'Level'} · {attempt.difficultyLevel}
                    </td>
                  ) : null}
                  <td className="px-4 py-2.5 tabular-nums">
                    {attempt.score} / {attempt.maxScore}
                  </td>
                  <td className="px-4 py-2.5">{attempt.passed ? 'Passed' : 'Not passed'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
