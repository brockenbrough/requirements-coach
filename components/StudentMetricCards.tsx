import { daysSince, type StudentMetrics } from '../lib/studentAttemptMetrics';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * GitHub #127: the four metric tiles from the mockup — same rounded-brand-lg/gray-50 card style
 * as components/ActivityStatsCards.tsx. classAverage is a separate prop (not part of
 * StudentMetrics) since it's a class-wide number, not something derived from one student's own
 * attempts — see app/instructor/students/[id]/page.tsx for where it comes from.
 */
export function StudentMetricCards({ metrics, classAverage }: { metrics: StudentMetrics; classAverage: number | null }) {
  const { averageScore, completedQuestions, averageStreakBeforeFail, lastActivity } = metrics;
  const scoreDelta = averageScore !== null && classAverage !== null ? averageScore - classAverage : null;

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
        <div className="text-2xl font-extrabold tabular-nums text-brand-navy">{averageScore === null ? '—' : `${averageScore}%`}</div>
        <div className="mt-1 text-xs font-bold uppercase tracking-wide text-gray-400">Average score</div>
        <div className="mt-1.5 text-xs font-semibold text-gray-500">
          {scoreDelta === null ? (
            'No completed attempts yet'
          ) : (
            <>
              <span className={`font-bold ${scoreDelta < 0 ? 'text-brand-danger' : 'text-brand-teal-dark'}`}>
                {scoreDelta === 0 ? 'Even with' : `${Math.abs(scoreDelta)} pts ${scoreDelta < 0 ? 'below' : 'above'}`}
              </span>{' '}
              class average ({classAverage}%)
            </>
          )}
        </div>
      </div>

      <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
        <div className="text-2xl font-extrabold tabular-nums text-brand-teal-dark">{completedQuestions}</div>
        <div className="mt-1 text-xs font-bold uppercase tracking-wide text-gray-400">Completed questions</div>
        <div className="mt-1.5 text-xs font-semibold text-gray-500">Every question answered so far</div>
      </div>

      <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
        <div className="text-2xl font-extrabold tabular-nums text-brand-purple">
          {averageStreakBeforeFail === null ? '—' : averageStreakBeforeFail.toFixed(1)}
        </div>
        <div className="mt-1 text-xs font-bold uppercase tracking-wide text-gray-400">Avg streak before fail</div>
        <div className="mt-1.5 text-xs font-semibold text-gray-500">Correct answers in a row</div>
      </div>

      <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
        <div className="text-2xl font-extrabold tabular-nums text-brand-gold-dark">
          {lastActivity === null ? '—' : `${daysSince(lastActivity.dateTime)}d ago`}
        </div>
        <div className="mt-1 text-xs font-bold uppercase tracking-wide text-gray-400">Last activity</div>
        <div className="mt-1.5 text-xs font-semibold text-gray-500">
          {lastActivity === null ? 'No attempts yet' : `${formatDate(lastActivity.dateTime)} · ${lastActivity.activityName}`}
        </div>
      </div>
    </div>
  );
}
