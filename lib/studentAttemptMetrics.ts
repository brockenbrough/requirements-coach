import { summarizeStudents, type StudentActivitySummary } from './activityLogTypes';
import type { StudentAttemptDetail } from './mockStudentAttempts';

export type StudentMetrics = {
  averageScore: number | null;
  abandonedCount: number;
  needsAttention: boolean;
  completedQuestions: number;
  averageStreakBeforeFail: number | null;
  lastActivity: StudentAttemptDetail | null;
};

/**
 * GitHub #127: every number here is computed from the attempt list handed in, never hardcoded —
 * so swapping getMockStudentAttempts() for a real per-student fetch (see that file's docstring)
 * is the only change needed; this function doesn't know or care that the data is mock.
 */
export function computeStudentMetrics(studentId: string, studentName: string, attempts: StudentAttemptDetail[]): StudentMetrics {
  // averageScore/abandonedCount/needsAttention reuse the exact same thresholds and "completed
  // attempts only" rule the roster (lib/activityLogTypes.ts's summarizeStudents) already uses —
  // so this page can never disagree with the dashboard about whether a student needs attention.
  // courses: [] — this page's own attempts are still mock data (see StudentAttemptDetail's own
  // docstring in mockStudentAttempts.ts), with no real course association to report.
  const asSummaries: StudentActivitySummary[] = attempts.map((attempt) => ({ ...attempt, studentId, studentName, courses: [] }));
  const [aggregate] = summarizeStudents(asSummaries);

  const completedQuestions = attempts.reduce((sum, attempt) => sum + attempt.answeredQuestions, 0);

  // Longest run of correct answers from the start of an attempt, up to (not including) the
  // first wrong one — averaged across every attempt with question-level data, finished or not.
  const streaks = attempts
    .filter((attempt) => attempt.questionResults.length > 0)
    .map((attempt) => {
      let streak = 0;
      for (const correct of attempt.questionResults) {
        if (!correct) break;
        streak++;
      }
      return streak;
    });
  const averageStreakBeforeFail = streaks.length === 0 ? null : streaks.reduce((sum, streak) => sum + streak, 0) / streaks.length;

  const lastActivity = attempts.reduce<StudentAttemptDetail | null>((latest, attempt) => {
    if (!latest || new Date(attempt.dateTime).getTime() > new Date(latest.dateTime).getTime()) return attempt;
    return latest;
  }, null);

  return {
    averageScore: aggregate?.averageScore ?? null,
    abandonedCount: aggregate?.abandonedCount ?? 0,
    needsAttention: aggregate?.needsAttention ?? false,
    completedQuestions,
    averageStreakBeforeFail,
    lastActivity,
  };
}

export function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
