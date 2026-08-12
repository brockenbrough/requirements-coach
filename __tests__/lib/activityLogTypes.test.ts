import { describe, expect, it } from 'vitest';
import { summarizeStudents, type StudentActivitySummary } from '../../lib/activityLogTypes';

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
});
