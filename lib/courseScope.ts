// GitHub #275 / REQ-PL-3.3: "Instructor should be able to enter a class code to restrict the
// students that are displayed." The class-wide instructor reads used to answer with every student
// in the system, which with three professors means each of them sees the other two's students,
// names and scores. This resolves ?courseId= to the set of students an instructor is allowed to
// see, so those routes can scope their query instead.
//
// REQ-PL-3.3 says "enter a class code", but course ownership is already in the schema
// (course.creator_id, REQ-DL-5), so the UI picks from the instructor's own courses and passes the
// course id. course_code stays what it is: the thing a *student* types to join.

import type { SupabaseClient } from './sessionQueries';
import { findOwnedCourse, loadEnrolledStudents } from './courseQueries';

export type CourseScopeResult =
  | { status: 'ok'; studentIds: string[] }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'error'; error: { message: string } };

/**
 * The students of one course, but only if the calling instructor owns it.
 *
 * Ownership comes from findOwnedCourse (lib/courseQueries.ts) so the 404-then-403 distinction is
 * made in exactly one place: a course that doesn't exist is a missing resource, a course that
 * exists but belongs to someone else must not be distinguishable from one that does — hence the
 * bodiless 403 the caller is expected to send, matching requireInstructor's convention.
 *
 * An owned course with nobody enrolled resolves to `{ status: 'ok', studentIds: [] }`, not an
 * error: a course created five minutes ago is a normal state. Callers must short-circuit on the
 * empty list rather than passing it to .in(...) — see fetchAllRowsByIds in lib/supabasePaging.ts.
 *
 * Takes the Supabase client as an argument, like requireInstructor, so its test can build a local
 * fake instead of mocking the module (the __tests__/lib/ convention).
 */
export async function resolveCourseScope(
  supabase: SupabaseClient,
  courseId: string,
  instructorId: string,
): Promise<CourseScopeResult> {
  const found = await findOwnedCourse(supabase, courseId, instructorId);
  if (found.status !== 'ok') return found;

  const { students, error } = await loadEnrolledStudents(supabase, courseId);
  if (error) return { status: 'error', error };

  return { status: 'ok', studentIds: (students ?? []).map((student) => student.id) };
}

export type RequireCourseScopeResult =
  | { ok: true; courseId: string; studentIds: string[] }
  | { ok: false; status: 400 | 403 | 404 | 500; error: string };

/**
 * The route-level wrapper: reads ?courseId= off the request, then resolveCourseScope.
 *
 * Every scoped instructor route repeats the same four failure branches, so they live here rather
 * than being copy-pasted four times — the one thing that must not drift between them is *which*
 * status a wrong course gets, since that is what keeps one professor from probing for another's
 * course ids.
 *
 * Run this only after requireInstructor: it assumes instructorId is already a confirmed
 * instructor, and checks ownership of the course, not the caller's role.
 */
export async function requireCourseScope(
  supabase: SupabaseClient,
  request: Request,
  instructorId: string,
): Promise<RequireCourseScopeResult> {
  const courseId = new URL(request.url).searchParams.get('courseId');
  if (!courseId || courseId.trim() === '') {
    return { ok: false, status: 400, error: 'courseId is required.' };
  }

  const scope = await resolveCourseScope(supabase, courseId, instructorId);

  if (scope.status === 'error') return { ok: false, status: 500, error: scope.error.message };
  if (scope.status === 'not_found') return { ok: false, status: 404, error: 'Course not found.' };
  if (scope.status === 'forbidden') return { ok: false, status: 403, error: 'Forbidden' };

  return { ok: true, courseId, studentIds: scope.studentIds };
}

/**
 * The response for a failed requireCourseScope. 403 carries no body at all, matching
 * requireInstructor and findOwnedCourse (GitHub #169's acceptance criteria); everything else
 * keeps the { error } shape the rest of the API uses.
 */
export function courseScopeErrorResponse(result: Extract<RequireCourseScopeResult, { ok: false }>): Response {
  return result.status === 403
    ? new Response(null, { status: 403 })
    : Response.json({ error: result.error }, { status: result.status });
}
