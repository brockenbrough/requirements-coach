import { describe, expect, it } from 'vitest';
import {
  deriveActivityFilterOptions,
  summarizeStudents,
  toAcSubmissionRow,
  toActivityLogEntry,
  toStudentActivitySummary,
  type ActivityLogEntry,
  type StudentActivitySummary,
} from '../../lib/activityLogTypes';
import type { InstructorACSubmission } from '../../lib/llmActivityClient';
import type { InstructorActivityEntry, SessionListEntry } from '../../lib/sessionTypes';

function session(overrides: Partial<SessionListEntry> = {}): SessionListEntry {
  return {
    session_id: 'session-1',
    user_id: 'student-1',
    activity_type: 'TEST_CATALOG',
    assembled_quiz_id: null,
    difficulty_level: 1,
    started_at: '2026-08-01T10:00:00.000Z',
    ended_at: '2026-08-01T10:20:00.000Z',
    status: 'completed',
    cumulative_score: 40,
    max_score: 40,
    passed: true,
    questionCount: 4,
    answeredCount: 4,
    nextPosition: null,
    ...overrides,
  };
}

// GitHub #476: without a real name to offer, a custom catalog's activity_type key (the raw,
// slugified value session_log actually stores, e.g. "TEST_CATALOG") is all there is to show — the
// bug was never resolving a better one at all, even when it was available.
describe('toActivityLogEntry', () => {
  it('falls back to the raw activity_type key when no name lookup is given', () => {
    const entry = toActivityLogEntry(session({ activity_type: 'TEST_CATALOG' }));

    expect(entry.activityName).toBe('TEST_CATALOG');
  });

  it('prefers the real name from nameByType over the raw key', () => {
    const nameByType = new Map([['TEST_CATALOG', 'Sprint 1 Requirements Check']]);

    const entry = toActivityLogEntry(session({ activity_type: 'TEST_CATALOG' }), nameByType);

    expect(entry.activityName).toBe('Sprint 1 Requirements Check');
  });

  it('falls back to the raw key when nameByType has no entry for this activity_type', () => {
    const nameByType = new Map([['SOME_OTHER_CATALOG', 'Unrelated Name']]);

    const entry = toActivityLogEntry(session({ activity_type: 'TEST_CATALOG' }), nameByType);

    expect(entry.activityName).toBe('TEST_CATALOG');
  });

  it('still resolves a built-in activity type\'s curated name, with or without nameByType', () => {
    const withoutLookup = toActivityLogEntry(session({ activity_type: 'IDENTIFY_WEAK_USER_STORIES' }));
    const withEmptyLookup = toActivityLogEntry(session({ activity_type: 'IDENTIFY_WEAK_USER_STORIES' }), new Map());

    expect(withoutLookup.activityName).toBe('Identify Weak User Stories');
    expect(withEmptyLookup.activityName).toBe('Identify Weak User Stories');
  });

  // Only the name resolution changed — every other field still reads straight off the session.
  it('leaves status, score and date untouched', () => {
    const entry = toActivityLogEntry(
      session({ cumulative_score: 30, max_score: 40, status: 'completed', passed: false }),
      new Map([['TEST_CATALOG', 'Sprint 1 Requirements Check']]),
    );

    expect(entry.score).toBe(30);
    expect(entry.maxScore).toBe(40);
    expect(entry.passed).toBe(false);
    expect(entry.status).toBe('completed');
    expect(entry.dateTime).toBe('2026-08-01T10:20:00.000Z');
  });
});

function instructorEntry(overrides: Partial<InstructorActivityEntry> = {}): InstructorActivityEntry {
  return {
    ...session(),
    studentId: 'student-1',
    studentName: 'Ann Attempter',
    courses: [],
    quizName: null,
    ...overrides,
  };
}

// GitHub #500: the combined Instructor Dashboard table's QUIZ column used to fall straight
// through to toActivityLogEntry's raw-key fallback for any custom catalog, since nothing called
// it with a nameByType map on this path — indistinguishable for two quizzes composed from the
// same catalog. quizName (resolved server-side, the assembled quiz's own name) fixes that without
// a second name-resolution mechanism: it's threaded through as a single-entry nameByType map.
describe('toStudentActivitySummary', () => {
  it("prefers the assembled quiz's name over the raw activity_type key", () => {
    const summary = toStudentActivitySummary(instructorEntry({ activity_type: 'TEST_CATALOG', quizName: 'Week 3 Quiz' }));

    expect(summary.activityName).toBe('Week 3 Quiz');
  });

  it('falls back to the raw key when quizName is null (catalog not linked to any quiz yet)', () => {
    const summary = toStudentActivitySummary(instructorEntry({ activity_type: 'TEST_CATALOG', quizName: null }));

    expect(summary.activityName).toBe('TEST_CATALOG');
  });

  it("still resolves a built-in activity type's curated name when quizName is null", () => {
    const summary = toStudentActivitySummary(instructorEntry({ activity_type: 'IDENTIFY_WEAK_USER_STORIES', quizName: null }));

    expect(summary.activityName).toBe('Identify Weak User Stories');
  });

  it('carries studentId/studentName/courses through unchanged', () => {
    const summary = toStudentActivitySummary(
      instructorEntry({ studentId: 'student-9', studentName: 'Zoe', courses: [{ courseId: 'c1', courseName: 'Requirements 101' }] }),
    );

    expect(summary.studentId).toBe('student-9');
    expect(summary.studentName).toBe('Zoe');
    expect(summary.courses).toEqual([{ courseId: 'c1', courseName: 'Requirements 101' }]);
  });
});

function acSubmission(overrides: Partial<InstructorACSubmission> = {}): InstructorACSubmission {
  return {
    submissionId: 'submission-1',
    sessionId: 'session-1',
    studentId: 'student-1',
    studentName: 'Ann Attempter',
    userStoryDescription: 'As a shopper, I want to check out.',
    activityType: 'MY_LLM_CATALOG',
    difficultyLevel: 1,
    submittedText: 'Given a cart, when checkout, then order created.',
    llmScore: 8,
    llmFeedback: 'Solid.',
    submittedAt: '2026-08-01T10:00:00.000Z',
    gradedAt: '2026-08-01T10:05:00.000Z',
    courses: [],
    quizName: null,
    ...overrides,
  };
}

describe('toAcSubmissionRow', () => {
  it("prefers the assembled quiz's name over the raw activity_type key", () => {
    const row = toAcSubmissionRow(acSubmission({ activityType: 'MY_LLM_CATALOG', quizName: 'Sprint 3 Acceptance Criteria' }));

    expect(row.activityName).toBe('Sprint 3 Acceptance Criteria');
  });

  it('falls back to the raw key when quizName is null', () => {
    const row = toAcSubmissionRow(acSubmission({ activityType: 'MY_LLM_CATALOG', quizName: null }));

    expect(row.activityName).toBe('MY_LLM_CATALOG');
  });

  // GitHub bug fix: attemptId must be the shared session, not the submission's own id, so
  // summarizeStudents can count sessions instead of prompts — see its own test below.
  it('sets attemptId to the submission’s sessionId, distinct from its own id', () => {
    const row = toAcSubmissionRow(acSubmission({ submissionId: 'submission-1', sessionId: 'session-1' }));

    expect(row.id).toBe('submission-1');
    expect(row.attemptId).toBe('session-1');
  });

  it('falls back to its own id when sessionId is null (a pre-session-wiring row)', () => {
    const row = toAcSubmissionRow(acSubmission({ submissionId: 'submission-1', sessionId: null }));

    expect(row.attemptId).toBe('submission-1');
  });
});

/**
 * summarizeStudents is a pure helper, so this test builds its input directly instead of mocking
 * lib/supabase — same shape as __tests__/lib/pagination.test.ts.
 *
 * The roster argument (GitHub #175) is what makes the All Students page show the real class:
 * before it, a student with no session at all had no row to aggregate and simply vanished.
 */
function attempt(overrides: Partial<StudentActivitySummary> = {}): StudentActivitySummary {
  return {
    id: 'session-1',
    activityType: 'identify-weak-user-stories',
    activityName: 'Identify Weak User Stories',
    level: 1,
    dateTime: '2026-08-01T10:00:00.000Z',
    status: 'completed',
    passed: true,
    score: 4,
    maxScore: 4,
    totalQuestions: 4,
    answeredQuestions: 4,
    studentId: 'student-a',
    studentName: 'Ann Attempter',
    ...overrides,
  };
}

describe('summarizeStudents', () => {
  it('keeps the attempts-only behaviour when no roster is passed', () => {
    const rows = summarizeStudents([attempt()]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ studentId: 'student-a', studentName: 'Ann Attempter', attempts: 1, averageScore: 100 });
  });

  it('includes roster students who have never attempted anything', () => {
    const rows = summarizeStudents(
      [attempt()],
      [
        { studentId: 'student-a', studentName: 'Ann Attempter' },
        { studentId: 'student-z', studentName: 'Zoe Newcomer' },
      ],
    );

    const zoe = rows.find((row) => row.studentId === 'student-z');
    expect(zoe).toMatchObject({
      studentName: 'Zoe Newcomer',
      attempts: 0,
      averageScore: null,
      abandonedCount: 0,
      needsAttention: false,
    });
  });

  it('gives a student with only unfinished attempts a null average', () => {
    const rows = summarizeStudents(
      [attempt({ studentId: 'student-b', studentName: 'Bob Busy', status: 'in-progress', passed: false, score: 0 })],
      [{ studentId: 'student-b', studentName: 'Bob Busy' }],
    );

    expect(rows[0]).toMatchObject({ attempts: 1, averageScore: null });
  });

  it('sorts null averages to the end in both score directions', () => {
    const rows = summarizeStudents(
      [attempt(), attempt({ id: 'session-2', studentId: 'student-c', studentName: 'Cal Low', score: 1 })],
      [
        { studentId: 'student-a', studentName: 'Ann Attempter' },
        { studentId: 'student-c', studentName: 'Cal Low' },
        { studentId: 'student-z', studentName: 'Zoe Newcomer' },
      ],
    );

    // Mirrors compareByScore in app/instructor/students/page.tsx.
    const byScore = (direction: 1 | -1) =>
      [...rows]
        .sort((a, b) => {
          if (a.averageScore === null) return b.averageScore === null ? 0 : 1;
          if (b.averageScore === null) return -1;
          return (a.averageScore - b.averageScore) * direction;
        })
        .map((row) => row.studentId);

    expect(byScore(1)).toEqual(['student-c', 'student-a', 'student-z']);
    expect(byScore(-1)).toEqual(['student-a', 'student-c', 'student-z']);
  });

  it('keeps students whose attempts exist but who are missing from the roster', () => {
    const rows = summarizeStudents([attempt()], [{ studentId: 'student-z', studentName: 'Zoe Newcomer' }]);

    expect(rows.map((row) => row.studentId).sort()).toEqual(['student-a', 'student-z']);
  });

  // GitHub bug fix: the Instructor Dashboard's roster used to show one "attempt" per AC
  // submission (one per graded prompt) instead of per session — a student who answered 4 prompts
  // in each of 2 llm-graded sessions showed as 8 attempts, not 2. Rows that share an attemptId
  // (multiple submissions from the same session) must collapse into a single attempt; rows with
  // no attemptId (ordinary quiz sessions, one row per session already) are unaffected.
  it('counts rows that share an attemptId as one attempt, not several', () => {
    const rows = summarizeStudents([
      attempt({ id: 'submission-1', attemptId: 'session-1', studentId: 'student-b', studentName: 'Bob Busy' }),
      attempt({ id: 'submission-2', attemptId: 'session-1', studentId: 'student-b', studentName: 'Bob Busy' }),
      attempt({ id: 'submission-3', attemptId: 'session-2', studentId: 'student-b', studentName: 'Bob Busy' }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ studentId: 'student-b', attempts: 2 });
  });
});

/**
 * deriveActivityFilterOptions is a pure helper too — same "build the input directly" shape as
 * summarizeStudents above.
 */
function logEntry(overrides: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
  return {
    id: 'session-1',
    activityType: 'identify-weak-user-stories',
    activityName: 'Identify Weak User Stories',
    level: 1,
    dateTime: '2026-08-01T10:00:00.000Z',
    status: 'completed',
    passed: true,
    score: 4,
    maxScore: 4,
    totalQuestions: 4,
    answeredQuestions: 4,
    ...overrides,
  };
}

describe('deriveActivityFilterOptions', () => {
  it('only offers activity types the student actually has entries for', () => {
    const options = deriveActivityFilterOptions([logEntry()]);

    expect(options).toEqual([{ value: 'identify-weak-user-stories', label: 'Identify Weak User Stories' }]);
  });

  it('never offers a built-in type with zero attempts', () => {
    const options = deriveActivityFilterOptions([logEntry()]);

    expect(options.some((option) => option.value === 'write-acceptance-criteria')).toBe(false);
  });

  it('returns no options for an empty log, so the filter shows only "All"', () => {
    expect(deriveActivityFilterOptions([])).toEqual([]);
  });

  it('collapses duplicate entries of the same type into one option', () => {
    const options = deriveActivityFilterOptions([logEntry(), logEntry({ id: 'session-2' })]);

    expect(options).toHaveLength(1);
  });

  it('prefers a real quiz_name over the raw activity_type key for a custom quiz', () => {
    const options = deriveActivityFilterOptions(
      [logEntry({ activityType: 'custom-jane-quiz-abc123', activityName: 'custom-jane-quiz-abc123' })],
      new Map([['custom-jane-quiz-abc123', "Jane's Custom Quiz"]]),
    );

    expect(options).toEqual([{ value: 'custom-jane-quiz-abc123', label: "Jane's Custom Quiz" }]);
  });

  it('falls back to the entry\'s own activityName when nameByType has no match', () => {
    const options = deriveActivityFilterOptions(
      [logEntry({ activityType: 'custom-jane-quiz-abc123', activityName: 'custom-jane-quiz-abc123' })],
      new Map([['some-other-type', 'Some Other Quiz']]),
    );

    expect(options).toEqual([{ value: 'custom-jane-quiz-abc123', label: 'custom-jane-quiz-abc123' }]);
  });

  it('sorts options alphabetically by label', () => {
    const options = deriveActivityFilterOptions([
      logEntry({ activityType: 'write-acceptance-criteria', activityName: 'Write Acceptance Criteria' }),
      logEntry({ activityType: 'identify-weak-user-stories', activityName: 'Identify Weak User Stories' }),
    ]);

    expect(options.map((option) => option.value)).toEqual(['identify-weak-user-stories', 'write-acceptance-criteria']);
  });
});
