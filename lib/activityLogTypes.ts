import { getActivityByType } from './activityContent';
import type { ActivityType } from './activityTypes';
import type { SessionListEntry } from './sessionClient';

export type ActivityLogStatus = 'completed' | 'in-progress' | 'abandoned';

/**
 * One attempt at an activity, as both the dashboard's "Recent activity" preview and the full
 * Activity Log page (GitHub #48) render it — never the raw session shape directly. See
 * toActivityLogEntry below for the one place that translates between the two.
 */
export type ActivityLogEntry = {
  id: string;
  activityType: ActivityType;
  /** Denormalized display name (e.g. "Identify Weak User Stories") — the row never looks this up itself. */
  activityName: string;
  level: 1 | 2 | 3;
  /** ISO 8601. */
  dateTime: string;
  status: ActivityLogStatus;
  /** Only meaningful when status is 'completed' — mirrors session_log.passed. */
  passed: boolean;
  score: number;
  maxScore: number;
  totalQuestions: number;
  answeredQuestions: number;
};

/**
 * The four states a log entry is actually displayed in. Derived rather than stored, the same
 * way lib/sessionRules.ts derives isPassing instead of keeping a second source of truth — status
 * and passed alone are enough, so nothing can drift between the table and the compact preview.
 */
export type ActivityResultState = 'passed' | 'not-passed' | 'abandoned' | 'in-progress';

export function resultStateOf(entry: Pick<ActivityLogEntry, 'status' | 'passed'>): ActivityResultState {
  if (entry.status === 'abandoned') return 'abandoned';
  if (entry.status === 'in-progress') return 'in-progress';
  return entry.passed ? 'passed' : 'not-passed';
}

/**
 * One student's attempt, as the Instructor Dashboard (GitHub #82) needs it — every field of
 * ActivityLogEntry plus who it belongs to. Deliberately an extension rather than a parallel
 * type: ActivityLogRow/ActivityLogTable/resultStateOf all keep working on this unchanged, and
 * a real "list every student's activity" endpoint only has to add studentId/studentName to
 * whatever it already returns for the single-student log.
 */
export type StudentActivitySummary = ActivityLogEntry & {
  studentId: string;
  studentName: string;
};

// Deliberately simple, visible thresholds rather than a statistical model — an instructor
// scanning a roster needs a reason they can eyeball, not a black-box score.
const LOW_SCORE_THRESHOLD = 70;
const HIGH_ABANDON_THRESHOLD = 2;

export type StudentAggregate = {
  studentId: string;
  studentName: string;
  attempts: number;
  averageScore: number | null;
  abandonedCount: number;
  needsAttention: boolean;
};

/**
 * One row per student instead of one per attempt — the Instructor Dashboard's roster and the
 * All Students page (GitHub #82) both answer "who", leaving "what happened" to ActivityLogTable.
 * Sorted needs-attention first (the whole point of surfacing this at all), then alphabetically,
 * so the order is stable and predictable rather than shuffling by score.
 */
export function summarizeStudents(entries: StudentActivitySummary[]): StudentAggregate[] {
  const byStudent = new Map<string, StudentActivitySummary[]>();
  for (const entry of entries) {
    const list = byStudent.get(entry.studentId) ?? [];
    list.push(entry);
    byStudent.set(entry.studentId, list);
  }

  return [...byStudent.entries()]
    .map(([studentId, list]) => {
      const completed = list.filter((entry) => entry.status === 'completed');
      const averageScore =
        completed.length === 0 ? null : Math.round(completed.reduce((sum, entry) => sum + entry.score, 0) / completed.length);
      const abandonedCount = list.filter((entry) => entry.status === 'abandoned').length;

      return {
        studentId,
        studentName: list[0].studentName,
        attempts: list.length,
        averageScore,
        abandonedCount,
        needsAttention: (averageScore !== null && averageScore < LOW_SCORE_THRESHOLD) || abandonedCount >= HIGH_ABANDON_THRESHOLD,
      };
    })
    .sort((a, b) => {
      if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
      return a.studentName.localeCompare(b.studentName);
    });
}

/**
 * Adapts the real session shape (GET /api/sessions, GET /api/students/{id}/activities) to the
 * ActivityLogEntry shape ActivityLogRow/ActivityLogTable/ActivityStatsCards/ActivityFilters
 * expect, so the dashboard's "Recent activity" preview and the full /dashboard/log page
 * (GitHub #48) can share one row component without either page knowing about the other's data
 * source.
 */
export function toActivityLogEntry(session: SessionListEntry): ActivityLogEntry {
  return {
    id: session.session_id,
    activityType: session.activity_type as ActivityType,
    activityName: getActivityByType(session.activity_type)?.name ?? session.activity_type,
    level: session.difficulty_level as 1 | 2 | 3,
    dateTime: session.ended_at ?? session.started_at,
    status: session.status === 'in-progress' || session.status === 'abandoned' ? session.status : 'completed',
    passed: session.passed,
    score: session.cumulative_score,
    maxScore: session.max_score,
    totalQuestions: session.questionCount,
    answeredQuestions: session.answeredCount,
  };
}
