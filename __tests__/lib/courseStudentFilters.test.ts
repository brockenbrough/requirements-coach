import { describe, expect, it } from 'vitest';
import { filterAndSortCourseStudents } from '../../lib/courseStudentFilters';
import type { CourseStudent } from '../../lib/courseTypes';

function student(overrides: Partial<CourseStudent> = {}): CourseStudent {
  return {
    id: 'student-1',
    name: 'Ada Lovelace',
    attempts: 3,
    averageScore: 80,
    abandonedCount: 0,
    needsAttention: false,
    ...overrides,
  };
}

describe('filterAndSortCourseStudents', () => {
  it('returns every student alphabetically when the filter is "all" and the query is empty', () => {
    const students = [student({ id: '1', name: 'Grace Hopper' }), student({ id: '2', name: 'Ada Lovelace' })];
    const result = filterAndSortCourseStudents(students, { query: '', filter: 'all' });
    expect(result.map((s) => s.name)).toEqual(['Ada Lovelace', 'Grace Hopper']);
  });

  it('filters by a case-insensitive name substring', () => {
    const students = [student({ id: '1', name: 'Grace Hopper' }), student({ id: '2', name: 'Ada Lovelace' })];
    const result = filterAndSortCourseStudents(students, { query: 'ADA', filter: 'all' });
    expect(result.map((s) => s.name)).toEqual(['Ada Lovelace']);
  });

  it('"needs-attention" keeps only flagged students', () => {
    const students = [
      student({ id: '1', name: 'Grace Hopper', needsAttention: true }),
      student({ id: '2', name: 'Ada Lovelace', needsAttention: false }),
    ];
    const result = filterAndSortCourseStudents(students, { query: '', filter: 'needs-attention' });
    expect(result.map((s) => s.id)).toEqual(['1']);
  });

  it('"no-attempts" keeps only students with zero attempts', () => {
    const students = [student({ id: '1', attempts: 0 }), student({ id: '2', attempts: 4 })];
    const result = filterAndSortCourseStudents(students, { query: '', filter: 'no-attempts' });
    expect(result.map((s) => s.id)).toEqual(['1']);
  });

  it('"score-asc" sorts by average score ascending without narrowing the list', () => {
    const students = [
      student({ id: '1', name: 'High', averageScore: 90 }),
      student({ id: '2', name: 'Low', averageScore: 40 }),
      student({ id: '3', name: 'Mid', averageScore: 65 }),
    ];
    const result = filterAndSortCourseStudents(students, { query: '', filter: 'score-asc' });
    expect(result.map((s) => s.id)).toEqual(['2', '3', '1']);
  });

  it('"score-asc" sorts a null average score (never completed) after every known score', () => {
    const students = [
      student({ id: '1', name: 'Scored', averageScore: 50 }),
      student({ id: '2', name: 'Unscored', averageScore: null }),
    ];
    const result = filterAndSortCourseStudents(students, { query: '', filter: 'score-asc' });
    expect(result.map((s) => s.id)).toEqual(['1', '2']);
  });

  it('search and filter combine', () => {
    const students = [
      student({ id: '1', name: 'Ada Lovelace', needsAttention: true }),
      student({ id: '2', name: 'Ada Byron', needsAttention: false }),
    ];
    const result = filterAndSortCourseStudents(students, { query: 'ada', filter: 'needs-attention' });
    expect(result.map((s) => s.id)).toEqual(['1']);
  });

  it('returns an empty array when nothing matches the search', () => {
    const result = filterAndSortCourseStudents([student()], { query: 'nobody', filter: 'all' });
    expect(result).toEqual([]);
  });
});
