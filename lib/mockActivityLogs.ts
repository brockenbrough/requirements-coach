import type { ActivityLogEntry } from './activityLogTypes';

/**
 * Placeholder for the activity-history endpoint GitHub #48's UI is designed against — nothing
 * behind this reads the database. Whoever wires up the real backend only needs to replace this
 * export with a fetch returning ActivityLogEntry[] (see that type for the exact shape expected);
 * ActivityLogRow, ActivityLogTable, ActivityStatsCards, ActivityFilters, and both pages that use
 * them (app/dashboard/log/page.tsx, the dashboard's "Recent activity" preview) don't change.
 */
export const MOCK_ACTIVITY_LOGS: ActivityLogEntry[] = [
  { id: 'log-1', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 2, dateTime: '2026-08-02T14:32:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'log-2', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 1, dateTime: '2026-08-02T09:15:00', status: 'completed', passed: false, score: 75, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'log-3', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 1, dateTime: '2026-08-01T20:03:00', status: 'abandoned', passed: false, score: 50, maxScore: 100, totalQuestions: 4, answeredQuestions: 2 },
  { id: 'log-4', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 2, dateTime: '2026-07-31T16:47:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'log-5', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 3, dateTime: '2026-07-31T11:20:00', status: 'in-progress', passed: false, score: 0, maxScore: 100, totalQuestions: 4, answeredQuestions: 1 },
  { id: 'log-6', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 1, dateTime: '2026-07-30T19:58:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'log-7', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 2, dateTime: '2026-07-29T08:44:00', status: 'completed', passed: false, score: 50, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'log-8', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 3, dateTime: '2026-07-28T21:10:00', status: 'abandoned', passed: false, score: 25, maxScore: 100, totalQuestions: 4, answeredQuestions: 1 },
  { id: 'log-9', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 1, dateTime: '2026-07-27T13:05:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'log-10', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 2, dateTime: '2026-07-26T17:39:00', status: 'completed', passed: false, score: 75, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'log-11', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 2, dateTime: '2026-07-25T10:12:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'log-12', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 1, dateTime: '2026-07-24T09:50:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'log-13', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 3, dateTime: '2026-07-22T15:27:00', status: 'completed', passed: false, score: 75, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'log-14', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 2, dateTime: '2026-07-20T12:03:00', status: 'abandoned', passed: false, score: 0, maxScore: 100, totalQuestions: 4, answeredQuestions: 0 },
  { id: 'log-15', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 1, dateTime: '2026-07-18T08:31:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'log-16', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 3, dateTime: '2026-07-16T14:44:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
];
