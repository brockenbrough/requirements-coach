import { PROMPT_PASS_SCORE, STORY_MAX_SCORE } from './llmActivityRules';
import type { InstructorACSubmission } from './llmActivityClient';
import { getActivityByType } from './activityContent';
import type { ActivityType } from './activityTypes';
import { toInstant } from './dateTime';
import type { InstructorActivityEntry, SessionListEntry } from './sessionClient';

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
 *
 * Pass `roster` (GET /api/instructor/students, GitHub #175) to include students with no attempts
 * at all: deriving the list from `entries` alone silently drops every enrolled student who never
 * started an activity. They come out with attempts 0 and averageScore null, which compareByScore
 * already sorts to the end in both directions. Callers that deliberately want the attempts-only
 * view — the dashboard's roster preview — just omit it.
 */
export function summarizeStudents(
  entries: StudentActivitySummary[],
  roster: { studentId: string; studentName: string }[] = [],
): StudentAggregate[] {
  const byStudent = new Map<string, StudentActivitySummary[]>();
  // Names come from both sides now, and a student in `roster` may have no entry to read one from.
  const nameById = new Map(roster.map((student) => [student.studentId, student.studentName]));
  for (const student of roster) byStudent.set(student.studentId, []);

  for (const entry of entries) {
    const list = byStudent.get(entry.studentId) ?? [];
    list.push(entry);
    byStudent.set(entry.studentId, list);
    nameById.set(entry.studentId, entry.studentName);
  }

  return [...byStudent.entries()]
    .map(([studentId, list]) => {
      const completed = list.filter((entry) => entry.status === 'completed' && entry.maxScore > 0);
      const averageScore =
        completed.length === 0
          ? null
          : Math.round(completed.reduce((sum, entry) => sum + (entry.score / entry.maxScore) * 100, 0) / completed.length);
      const abandonedCount = list.filter((entry) => entry.status === 'abandoned').length;

      return {
        studentId,
        studentName: nameById.get(studentId) ?? 'Unknown student',
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
/**
 * The instructor-side counterpart (GitHub #171): the same adaptation, plus the two fields that
 * say whose attempt it was. Built on toActivityLogEntry rather than beside it, so the student
 * log and the class-wide table cannot drift apart in how they read a session.
 */
export function toStudentActivitySummary(session: InstructorActivityEntry): StudentActivitySummary {
  return {
    ...toActivityLogEntry(session),
    studentId: session.studentId,
    studentName: session.studentName,
  };
}

export function toActivityLogEntry(session: SessionListEntry): ActivityLogEntry {
  return {
    id: session.session_id,
    activityType: session.activity_type as ActivityType,
    activityName: getActivityByType(session.activity_type)?.name ?? session.activity_type,
    level: session.difficulty_level as 1 | 2 | 3,
    // session_log's timestamps carry no zone; toInstant marks them as the UTC they are, so
    // ActivityLogRow/StudentScoreChart/StudentMetricCards all format the right local time.
    dateTime: toInstant(session.ended_at ?? session.started_at),
    status: session.status === 'in-progress' || session.status === 'abandoned' ? session.status : 'completed',
    passed: session.passed,
    score: session.cumulative_score,
    maxScore: session.max_score,
    totalQuestions: session.questionCount,
    answeredQuestions: session.answeredCount,
  };
}

/**
 * GitHub #276: the combined Instructor Dashboard table's row type — a quiz attempt
 * (IDENTIFY_WEAK_USER_STORIES / IDENTIFY_WEAK_ACCEPTANCE_CRITERIA session) or a Write Acceptance
 * Criteria submission, discriminated by `kind` so ActivityLogRow's expand panel knows which
 * detail component to render (QuizAttemptDetails vs AcSubmissionDetails) without re-deriving it
 * from activityType. Both members still extend ActivityLogEntry, so everything that already
 * consumes that shape (ActivityLogTable's columns, InstructorActivityStats' per-activity
 * averages, resultStateOf) keeps working unchanged on either kind of row.
 */
export type QuizAttemptRow = StudentActivitySummary & { kind: 'quiz' };

export type AcSubmissionRow = ActivityLogEntry & {
  kind: 'ac-submission';
  studentId: string;
  studentName: string;
  userStoryDescription: string;
  submittedText: string;
  llmFeedback: string | null;
};

export type ActivityRow = QuizAttemptRow | AcSubmissionRow;

export function toQuizAttemptRow(session: InstructorActivityEntry): QuizAttemptRow {
  return { ...toStudentActivitySummary(session), kind: 'quiz' };
}

/**
 * A submission has no session concept to ask "how far did they get" — it is graded in one shot
 * (POST .../submissions grades synchronously) or, in the rare crash-between-insert-and-update
 * case the schema's own comment describes, sits ungraded. That maps onto the same
 * status/answeredQuestions/totalQuestions fields ActivityLogRow already reads: 'completed' with
 * a real score once graded, 'in-progress' (0 of 1 "answered") while it isn't — never 'abandoned',
 * since nothing about submitting criteria can be abandoned the way a multi-question session can.
 */
export function toAcSubmissionRow(submission: InstructorACSubmission): AcSubmissionRow {
  const graded = submission.llmScore !== null;

  return {
    // Deliberately still 'ac-submission': it is an internal discriminant read by
    // ActivityLogRow's expand-panel switch, and renaming it would be pure churn with a real
    // chance of missing a branch.
    kind: 'ac-submission',
    id: submission.submissionId,
    studentId: submission.studentId,
    studentName: submission.studentName,
    // GitHub #379: read off the submission rather than hardcoded — more than one activity can be
    // llm-graded now, so a fixed key would mislabel every instructor-created one. Same
    // getActivityByType-else-key fallback toActivityLogEntry already uses for a custom catalog.
    activityType: submission.activityType,
    activityName: getActivityByType(submission.activityType)?.name ?? submission.activityType,
    level: submission.difficultyLevel,
    dateTime: submission.submittedAt,
    status: graded ? 'completed' : 'in-progress',
    passed: graded && submission.llmScore! >= PROMPT_PASS_SCORE,
    score: submission.llmScore ?? 0,
    maxScore: STORY_MAX_SCORE,
    totalQuestions: 1,
    answeredQuestions: graded ? 1 : 0,
    userStoryDescription: submission.userStoryDescription,
    submittedText: submission.submittedText,
    llmFeedback: submission.llmFeedback,
  };
}
