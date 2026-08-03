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
];
