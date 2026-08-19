import { getActivityByType } from '../lib/activityContent';
import type { StudentAttemptDetail } from '../lib/activityLogTypes';

type ActivityGroup = {
  activityType: string;
  activityName: string;
  currentLevel: 1 | 2 | 3;
  averageScore: number | null;
  isAcceptanceCriteria: boolean;
};

function groupByActivity(attempts: StudentAttemptDetail[]): ActivityGroup[] {
  const byType = new Map<string, StudentAttemptDetail[]>();
  for (const attempt of attempts) {
    const list = byType.get(attempt.activityType) ?? [];
    list.push(attempt);
    byType.set(attempt.activityType, list);
  }

  return [...byType.entries()].map(([activityType, list]) => {
    // Current level = the level of the most recent attempt — mirrors how the real session model
    // works: the next session for this activity always starts at whatever level the student is
    // currently on (see START_DIFFICULTY_LEVEL / session_log.difficulty_level).
    const newest = [...list].sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())[0];

    const completed = list.filter((attempt) => attempt.status === 'completed' && attempt.maxScore > 0);
    const averageScore =
      completed.length === 0
        ? null
        : Math.round(completed.reduce((sum, attempt) => sum + (attempt.score / attempt.maxScore) * 100, 0) / completed.length);

    return {
      activityType,
      activityName: newest.activityName,
      currentLevel: newest.level,
      averageScore,
      isAcceptanceCriteria: getActivityByType(activityType)?.category === 'Acceptance Criteria',
    };
  });
}

/**
 * GitHub #127: per-activity-type breakdown from the mockup — level progress (filled up to the
 * student's current level) plus average score, one row per activity type they've attempted.
 * Color follows the same category convention as components/ActivityCard.tsx's CategoryIcon
 * (teal for Acceptance Criteria, purple otherwise) so it reads consistently with the rest of
 * the app rather than introducing a new color rule just for this panel.
 */
export function StudentActivityBreakdown({ attempts }: { attempts: StudentAttemptDetail[] }) {
  const groups = groupByActivity(attempts);

  return (
    <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
      <p className="mb-4 text-sm font-extrabold text-brand-navy">By activity type</p>

      {groups.length === 0 ? (
        <p className="text-sm font-semibold text-gray-500">No attempts yet in your courses with this student.</p>
      ) : null}

      {groups.map((group, index) => {
        const accent = group.isAcceptanceCriteria ? '#2DD4BF' : '#7C4DFF';
        return (
          <div key={group.activityType} className={index === groups.length - 1 ? '' : 'mb-5'}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-gray-600">{group.activityName}</span>
              <span className="text-xs font-extrabold text-gray-600">Level {group.currentLevel} of 3</span>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3].map((segment) => (
                <span
                  key={segment}
                  className="h-1.5 flex-1 rounded-full"
                  style={{ background: segment <= group.currentLevel ? accent : '#f3f4f6' }}
                />
              ))}
            </div>

            <div className="mb-1.5 mt-2.5 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-gray-600">Average score</span>
              <span className="text-xs font-extrabold tabular-nums text-brand-navy">{group.averageScore === null ? '—' : `${group.averageScore}%`}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
              <span className="block h-full rounded-full" style={{ width: `${group.averageScore ?? 0}%`, background: accent }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
