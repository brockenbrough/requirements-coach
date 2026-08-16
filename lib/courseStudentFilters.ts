// GitHub #378 "UI: Change Course View" — the search + filter dropdown shared by
// CourseStudentsDrawer and app/instructor/courses/[id]/students/page.tsx (StudentFilterControls
// renders the controls; this is the pure function that actually applies them). One function so
// the drawer and the full page can never disagree about what "Needs attention" or "No attempts
// yet" mean. Pure and framework-free, so it's testable without a DOM — the same reason
// lib/activityCardStatus.ts exists as its own module instead of living inside a component.

import type { CourseStudent } from './courseTypes';

export type CourseStudentFilter = 'all' | 'needs-attention' | 'no-attempts' | 'score-asc';

/**
 * The four options were picked because every one of them reads directly off a field
 * GET /api/instructor/courses/{id} already returns per student (needsAttention, attempts,
 * averageScore) — no new aggregation needed, and both surfaces stay honest about "what the data
 * already says" rather than inventing a new metric. 'score-asc' is grouped into the same dropdown
 * as the three true filters, matching the issue's own wording and the precedent already set by
 * app/instructor/students/page.tsx's sort <select> (which mixes a priority filter and several
 * sorts the same way) — a separate sort control next to the filter would be one more piece of UI
 * for what's still a single "how do I want to see this list" choice.
 */
export const COURSE_STUDENT_FILTER_OPTIONS: { value: CourseStudentFilter; label: string }[] = [
  { value: 'all', label: 'All students' },
  { value: 'needs-attention', label: 'Needs attention' },
  { value: 'no-attempts', label: 'No attempts yet' },
  { value: 'score-asc', label: 'Lowest average score first' },
];

function byName(a: CourseStudent, b: CourseStudent): number {
  return a.name.localeCompare(b.name);
}

/** null (no completed attempts yet) always sorts after every known average. */
function byScoreAscending(a: CourseStudent, b: CourseStudent): number {
  if (a.averageScore === null) return b.averageScore === null ? 0 : 1;
  if (b.averageScore === null) return -1;
  return a.averageScore - b.averageScore;
}

/**
 * Applies the search box (substring match against name, case-insensitive) and the filter dropdown
 * to one course's roster. 'score-asc' sorts the full searched set rather than narrowing it —
 * every other option is a true subset filter, alphabetical within it.
 */
export function filterAndSortCourseStudents(
  students: readonly CourseStudent[],
  params: { query: string; filter: CourseStudentFilter },
): CourseStudent[] {
  const q = params.query.trim().toLowerCase();
  const searched = q ? students.filter((student) => student.name.toLowerCase().includes(q)) : [...students];

  switch (params.filter) {
    case 'needs-attention':
      return searched.filter((student) => student.needsAttention).sort(byName);
    case 'no-attempts':
      return searched.filter((student) => student.attempts === 0).sort(byName);
    case 'score-asc':
      return searched.sort(byScoreAscending);
    default:
      return searched.sort(byName);
  }
}
