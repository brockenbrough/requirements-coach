import { getActivityByType } from './activityContent';
import type { ActivityLogEntry } from './activityLogTypes';

/**
 * GitHub #127: per-question correctness for one attempt, in answer order. Mock-only scaffolding
 * for "average streak before fail" — the real answered_question_log table already stores
 * per-question correctness (see SessionAnswer.correct in lib/sessionClient.ts), it just isn't
 * aggregated per attempt anywhere yet. A real endpoint for this page should return this same
 * shape (ActivityLogEntry plus questionResults) so lib/studentAttemptMetrics.ts keeps working
 * unchanged — see that file for what the real integration still needs to build.
 */
export type StudentAttemptDetail = ActivityLogEntry & {
  questionResults: boolean[];
};

function daysAgo(days: number, hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function activityName(activityType: ActivityLogEntry['activityType']): string {
  return getActivityByType(activityType)?.name ?? activityType;
}

/**
 * Placeholder for the real "one student's attempts" endpoint (GitHub #127's UI is built ahead of
 * that backend work). Every /instructor/students/[id] page reads the exact same list regardless
 * of which real student was clicked — see app/instructor/students/[id]/page.tsx for why that's
 * an acceptable gap for a UI-only pass, and what a real integration needs to change.
 *
 * Dates are relative to "now" (not fixed calendar dates) so the mock never looks stale, and the
 * chronological order/score pattern intentionally tells one coherent story: two early passes,
 * then a recent dip — the same "needs attention" narrative the mockup was built around.
 */
export function getMockStudentAttempts(): StudentAttemptDetail[] {
  return [
    {
      id: 'mock-attempt-1',
      activityType: 'IDENTIFY_WEAK_USER_STORIES',
      activityName: activityName('IDENTIFY_WEAK_USER_STORIES'),
      level: 1,
      dateTime: daysAgo(44, 10, 12),
      status: 'completed',
      passed: false,
      score: 62,
      maxScore: 100,
      totalQuestions: 4,
      answeredQuestions: 4,
      questionResults: [true, false, true, false],
    },
    {
      id: 'mock-attempt-2',
      activityType: 'IDENTIFY_WEAK_USER_STORIES',
      activityName: activityName('IDENTIFY_WEAK_USER_STORIES'),
      level: 1,
      dateTime: daysAgo(41, 16, 30),
      status: 'completed',
      passed: false,
      score: 75,
      maxScore: 100,
      totalQuestions: 4,
      answeredQuestions: 4,
      questionResults: [true, true, false, true],
    },
    {
      id: 'mock-attempt-3',
      activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA',
      activityName: activityName('IDENTIFY_WEAK_ACCEPTANCE_CRITERIA'),
      level: 1,
      dateTime: daysAgo(37, 11, 5),
      status: 'completed',
      passed: false,
      score: 55,
      maxScore: 100,
      totalQuestions: 4,
      answeredQuestions: 4,
      questionResults: [false, true, true, false],
    },
    {
      id: 'mock-attempt-4',
      activityType: 'IDENTIFY_WEAK_USER_STORIES',
      activityName: activityName('IDENTIFY_WEAK_USER_STORIES'),
      level: 1,
      dateTime: daysAgo(32, 14, 47),
      status: 'completed',
      passed: true,
      score: 85,
      maxScore: 100,
      totalQuestions: 4,
      answeredQuestions: 4,
      questionResults: [true, true, true, false],
    },
    {
      id: 'mock-attempt-5',
      activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA',
      activityName: activityName('IDENTIFY_WEAK_ACCEPTANCE_CRITERIA'),
      level: 1,
      dateTime: daysAgo(28, 9, 15),
      status: 'completed',
      passed: false,
      score: 70,
      maxScore: 100,
      totalQuestions: 4,
      answeredQuestions: 4,
      questionResults: [true, false, true, true],
    },
    {
      id: 'mock-attempt-6',
      activityType: 'IDENTIFY_WEAK_USER_STORIES',
      activityName: activityName('IDENTIFY_WEAK_USER_STORIES'),
      level: 2,
      dateTime: daysAgo(22, 15, 22),
      status: 'completed',
      passed: true,
      score: 90,
      maxScore: 100,
      totalQuestions: 4,
      answeredQuestions: 4,
      questionResults: [true, true, true, true],
    },
    {
      id: 'mock-attempt-7',
      activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA',
      activityName: activityName('IDENTIFY_WEAK_ACCEPTANCE_CRITERIA'),
      level: 1,
      dateTime: daysAgo(17, 13, 8),
      status: 'abandoned',
      passed: false,
      score: 40,
      maxScore: 100,
      totalQuestions: 4,
      answeredQuestions: 2,
      questionResults: [true, false],
    },
    {
      id: 'mock-attempt-8',
      activityType: 'IDENTIFY_WEAK_USER_STORIES',
      activityName: activityName('IDENTIFY_WEAK_USER_STORIES'),
      level: 3,
      dateTime: daysAgo(12, 10, 40),
      status: 'completed',
      passed: false,
      score: 58,
      maxScore: 100,
      totalQuestions: 4,
      answeredQuestions: 4,
      questionResults: [false, true, false, true],
    },
    {
      id: 'mock-attempt-9',
      activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA',
      activityName: activityName('IDENTIFY_WEAK_ACCEPTANCE_CRITERIA'),
      level: 1,
      dateTime: daysAgo(7, 17, 16),
      status: 'completed',
      passed: false,
      score: 72,
      maxScore: 100,
      totalQuestions: 4,
      answeredQuestions: 4,
      questionResults: [true, true, false, true],
    },
    {
      id: 'mock-attempt-10',
      activityType: 'IDENTIFY_WEAK_USER_STORIES',
      activityName: activityName('IDENTIFY_WEAK_USER_STORIES'),
      level: 3,
      dateTime: daysAgo(6, 9, 20),
      status: 'in-progress',
      passed: false,
      score: 18,
      maxScore: 100,
      totalQuestions: 4,
      answeredQuestions: 2,
      questionResults: [true, true],
    },
  ];
}
