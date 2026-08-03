import type { StudentActivitySummary } from './activityLogTypes';

/**
 * Placeholder for the class-wide history endpoint the Instructor Dashboard (GitHub #82) is
 * designed against — nothing behind this reads the database or lists real students. Whoever
 * wires up the real backend replaces this export with a fetch returning
 * StudentActivitySummary[] (scoped server-side to students, never trusted from the client);
 * InstructorRoster, InstructorFilters, ActivityLogTable/ActivityLogRow, and app/instructor/page.tsx
 * don't change.
 */
export const MOCK_STUDENT_ACTIVITY: StudentActivitySummary[] = [
  // Alex Chen — consistently strong.
  { id: 'sa-1', studentId: 'student-1', studentName: 'Alex Chen', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 3, dateTime: '2026-08-02T10:15:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'sa-2', studentId: 'student-1', studentName: 'Alex Chen', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 2, dateTime: '2026-07-30T09:05:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'sa-3', studentId: 'student-1', studentName: 'Alex Chen', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 2, dateTime: '2026-07-27T14:40:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'sa-4', studentId: 'student-1', studentName: 'Alex Chen', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 1, dateTime: '2026-07-21T11:00:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },

  // Jordan Smith — solid, one rough attempt.
  { id: 'sa-5', studentId: 'student-2', studentName: 'Jordan Smith', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 2, dateTime: '2026-08-01T16:22:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'sa-6', studentId: 'student-2', studentName: 'Jordan Smith', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 1, dateTime: '2026-07-29T13:10:00', status: 'completed', passed: false, score: 75, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'sa-7', studentId: 'student-2', studentName: 'Jordan Smith', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 1, dateTime: '2026-07-26T08:50:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'sa-8', studentId: 'student-2', studentName: 'Jordan Smith', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 1, dateTime: '2026-07-19T15:35:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },

  // Priya Patel — mixed.
  { id: 'sa-9', studentId: 'student-3', studentName: 'Priya Patel', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 2, dateTime: '2026-08-02T09:00:00', status: 'completed', passed: false, score: 50, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'sa-10', studentId: 'student-3', studentName: 'Priya Patel', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 1, dateTime: '2026-07-28T17:12:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'sa-11', studentId: 'student-3', studentName: 'Priya Patel', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 1, dateTime: '2026-07-24T10:45:00', status: 'abandoned', passed: false, score: 25, maxScore: 100, totalQuestions: 4, answeredQuestions: 1 },
  { id: 'sa-12', studentId: 'student-3', studentName: 'Priya Patel', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 1, dateTime: '2026-07-20T12:30:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },

  // Sam Rodriguez — struggling.
  { id: 'sa-13', studentId: 'student-4', studentName: 'Sam Rodriguez', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 1, dateTime: '2026-08-01T11:18:00', status: 'completed', passed: false, score: 25, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'sa-14', studentId: 'student-4', studentName: 'Sam Rodriguez', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 1, dateTime: '2026-07-27T09:40:00', status: 'abandoned', passed: false, score: 0, maxScore: 100, totalQuestions: 4, answeredQuestions: 1 },
  { id: 'sa-15', studentId: 'student-4', studentName: 'Sam Rodriguez', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 1, dateTime: '2026-07-22T14:05:00', status: 'completed', passed: false, score: 50, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },

  // Morgan Lee — the one who most needs help: low scores, repeated abandons.
  { id: 'sa-16', studentId: 'student-5', studentName: 'Morgan Lee', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 1, dateTime: '2026-08-02T08:30:00', status: 'abandoned', passed: false, score: 0, maxScore: 100, totalQuestions: 4, answeredQuestions: 0 },
  { id: 'sa-17', studentId: 'student-5', studentName: 'Morgan Lee', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 1, dateTime: '2026-07-29T10:00:00', status: 'abandoned', passed: false, score: 25, maxScore: 100, totalQuestions: 4, answeredQuestions: 2 },
  { id: 'sa-18', studentId: 'student-5', studentName: 'Morgan Lee', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 1, dateTime: '2026-07-25T16:15:00', status: 'completed', passed: false, score: 25, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'sa-19', studentId: 'student-5', studentName: 'Morgan Lee', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 1, dateTime: '2026-07-18T13:20:00', status: 'completed', passed: false, score: 0, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },

  // Taylor Kim — just getting started.
  { id: 'sa-20', studentId: 'student-6', studentName: 'Taylor Kim', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 1, dateTime: '2026-08-02T15:50:00', status: 'in-progress', passed: false, score: 25, maxScore: 100, totalQuestions: 4, answeredQuestions: 2 },
  { id: 'sa-21', studentId: 'student-6', studentName: 'Taylor Kim', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 1, dateTime: '2026-07-30T14:00:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },

  // Casey Nguyen — mixed.
  { id: 'sa-22', studentId: 'student-7', studentName: 'Casey Nguyen', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 2, dateTime: '2026-08-01T09:25:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'sa-23', studentId: 'student-7', studentName: 'Casey Nguyen', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 1, dateTime: '2026-07-28T13:45:00', status: 'completed', passed: false, score: 75, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'sa-24', studentId: 'student-7', studentName: 'Casey Nguyen', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 1, dateTime: '2026-07-23T10:10:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },

  // Riley Johnson — strong.
  { id: 'sa-25', studentId: 'student-8', studentName: 'Riley Johnson', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 3, dateTime: '2026-08-02T11:40:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'sa-26', studentId: 'student-8', studentName: 'Riley Johnson', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 2, dateTime: '2026-07-29T16:05:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },

  // Devon Brooks — another one who needs help.
  { id: 'sa-27', studentId: 'student-9', studentName: 'Devon Brooks', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 1, dateTime: '2026-08-01T14:55:00', status: 'abandoned', passed: false, score: 25, maxScore: 100, totalQuestions: 4, answeredQuestions: 1 },
  { id: 'sa-28', studentId: 'student-9', studentName: 'Devon Brooks', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 1, dateTime: '2026-07-26T09:30:00', status: 'abandoned', passed: false, score: 0, maxScore: 100, totalQuestions: 4, answeredQuestions: 0 },
  { id: 'sa-29', studentId: 'student-9', studentName: 'Devon Brooks', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 1, dateTime: '2026-07-21T15:20:00', status: 'completed', passed: false, score: 50, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },

  // Jamie Rivera — strong.
  { id: 'sa-30', studentId: 'student-10', studentName: 'Jamie Rivera', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 2, dateTime: '2026-07-31T08:15:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'sa-31', studentId: 'student-10', studentName: 'Jamie Rivera', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 1, dateTime: '2026-07-24T12:50:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },

  // Quinn Alvarez — mixed.
  { id: 'sa-32', studentId: 'student-11', studentName: 'Quinn Alvarez', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 2, dateTime: '2026-07-30T17:00:00', status: 'completed', passed: false, score: 75, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
  { id: 'sa-33', studentId: 'student-11', studentName: 'Quinn Alvarez', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 1, dateTime: '2026-07-19T11:35:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },

  // Harper Wilson — new-ish, doing fine so far.
  { id: 'sa-34', studentId: 'student-12', studentName: 'Harper Wilson', activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', activityName: 'Identify Weak Acceptance Criteria', level: 1, dateTime: '2026-08-02T13:05:00', status: 'in-progress', passed: false, score: 25, maxScore: 100, totalQuestions: 4, answeredQuestions: 1 },
  { id: 'sa-35', studentId: 'student-12', studentName: 'Harper Wilson', activityType: 'IDENTIFY_WEAK_USER_STORIES', activityName: 'Identify Weak User Stories', level: 1, dateTime: '2026-07-25T09:50:00', status: 'completed', passed: true, score: 100, maxScore: 100, totalQuestions: 4, answeredQuestions: 4 },
];
