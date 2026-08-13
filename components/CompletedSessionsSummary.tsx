import { StatTile } from './StatTile';

/**
 * GitHub #39: the student's standing at a glance — cumulative score plus how many sessions
 * they've completed and how many levels they've passed in total, across every activity type.
 * Cumulative score is a separate acceptance criterion from the sessions/levels summary in the
 * issue, but all three are "where do I currently stand" numbers read off the same two API
 * calls, so they render as one stat row rather than two disconnected ones.
 */
export function CompletedSessionsSummary({
  cumulativeScore,
  sessionsCompleted,
  levelsPassed,
}: {
  cumulativeScore: number;
  sessionsCompleted: number;
  levelsPassed: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatTile value={cumulativeScore} label="Cumulative score" />
      <StatTile value={sessionsCompleted} label="Sessions completed" />
      <StatTile value={levelsPassed} label="Levels passed" />
    </div>
  );
}
