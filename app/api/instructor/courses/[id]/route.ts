import { getSupabaseClient } from '../../../../../lib/supabase';
import { requireInstructor } from '../../../../../lib/instructorAuth';
import { deleteCourse, findOwnedCourse, loadEnrolledStudents, updateCourseMeta } from '../../../../../lib/courseQueries';
import { loadStudentActivityForIds } from '../../../../../lib/sessionQueries';
import { summarizeStudents, toStudentActivitySummary } from '../../../../../lib/activityLogTypes';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/** Shared guard + ownership dance for both handlers below. */
async function authorizeCourse(request: Request, courseId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, response: Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 }) };
  }

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    const response =
      guard.status === 403
        ? new Response(null, { status: 403 })
        : Response.json(
            { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
            { status: guard.status },
          );
    return { ok: false as const, response };
  }

  const found = await findOwnedCourse(supabase, courseId, guard.user_id);
  if (found.status === 'error') {
    return { ok: false as const, response: Response.json({ error: found.error.message }, { status: 500 }) };
  }
  if (found.status === 'not_found') {
    return { ok: false as const, response: Response.json({ error: 'Course not found.' }, { status: 404 }) };
  }
  if (found.status === 'forbidden') {
    return { ok: false as const, response: new Response(null, { status: 403 }) };
  }

  return { ok: true as const, supabase, course: found.course };
}

/**
 * GET /api/instructor/courses/{id} — one course plus its enrolled students, each with an
 * attempt/score summary built the same way the Instructor Dashboard's roster is (summarizeStudents,
 * lib/activityLogTypes.ts, GitHub #82) — the first server-side caller of that function, safe
 * because it's already pure/framework-agnostic.
 *
 * An enrolled student with zero attempts still gets a row (attempts: 0, averageScore: null,
 * abandonedCount: 0, needsAttention: false) — summarizeStudents only emits a row per student
 * *present in its input*, so a student who never showed up in session_log would otherwise
 * silently vanish from the roster instead of appearing with zeros.
 *
 * - 401/403/404/403(not owner) — see authorizeCourse
 * - 200 { course: { id, name, code, createdAt, semester, coverImageUrl }, students: [...] }
 * - 500 on any query failure
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const authz = await authorizeCourse(request, params.id);
  if (!authz.ok) return authz.response;
  const { supabase, course } = authz;

  const { students: enrolled, error: rosterError } = await loadEnrolledStudents(supabase, params.id);
  if (rosterError || !enrolled) {
    return Response.json({ error: rosterError?.message ?? 'Could not load roster.' }, { status: 500 });
  }

  const { activities, error: activityError } = await loadStudentActivityForIds(
    supabase,
    enrolled.map((s) => s.id),
  );
  if (activityError || !activities) {
    return Response.json({ error: activityError?.message ?? 'Could not load student activity.' }, { status: 500 });
  }

  const aggregates = new Map(
    summarizeStudents(activities.map(toStudentActivitySummary)).map((a) => [a.studentId, a]),
  );

  const students = enrolled.map((s) => {
    const agg = aggregates.get(s.id);
    return {
      id: s.id,
      name: s.name,
      attempts: agg?.attempts ?? 0,
      averageScore: agg?.averageScore ?? null,
      abandonedCount: agg?.abandonedCount ?? 0,
      needsAttention: agg?.needsAttention ?? false,
    };
  });

  return Response.json(
    {
      course: {
        id: course.course_id,
        name: course.course_name,
        code: course.course_code,
        createdAt: course.created_at,
        semester: course.semester,
        coverImageUrl: course.cover_image_url,
      },
      students,
    },
    { status: 200 },
  );
}

/**
 * PATCH /api/instructor/courses/{id} — renames a course and/or updates its semester/term label
 * and/or its cover image (GitHub #363, #363 follow-up).
 *
 * Body: { name, semester?, coverImageUrl? }. Omitting a key entirely leaves that stored value
 * untouched; passing null or "" clears it. A non-string, non-null semester/coverImageUrl is
 * rejected, same as POST.
 * - 401/403/404/403(not owner) — see authorizeCourse
 * - 400 invalid JSON, missing/blank name, or a non-string semester/coverImageUrl
 * - 200 { course: { id, name, code, createdAt, semester, coverImageUrl } }
 * - 500 on an update failure
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const authz = await authorizeCourse(request, params.id);
  if (!authz.ok) return authz.response;
  const { supabase } = authz;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { name, semester, coverImageUrl } = (body ?? {}) as { name?: unknown; semester?: unknown; coverImageUrl?: unknown };
  if (typeof name !== 'string' || name.trim() === '') {
    return Response.json({ error: 'name is required.' }, { status: 400 });
  }
  if (semester !== undefined && semester !== null && typeof semester !== 'string') {
    return Response.json({ error: 'semester must be a string.' }, { status: 400 });
  }
  if (coverImageUrl !== undefined && coverImageUrl !== null && typeof coverImageUrl !== 'string') {
    return Response.json({ error: 'coverImageUrl must be a string.' }, { status: 400 });
  }

  const { course: updated, error } = await updateCourseMeta(supabase, {
    courseId: params.id,
    name: name.trim(),
    semester: semester === undefined ? undefined : typeof semester === 'string' ? semester.trim() || null : null,
    coverImageUrl:
      coverImageUrl === undefined ? undefined : typeof coverImageUrl === 'string' ? coverImageUrl.trim() || null : null,
  });
  if (error || !updated) {
    return Response.json({ error: error?.message ?? 'Could not update course.' }, { status: 500 });
  }

  return Response.json(
    {
      course: {
        id: updated.course_id,
        name: updated.course_name,
        code: updated.course_code,
        createdAt: updated.created_at,
        semester: updated.semester,
        coverImageUrl: updated.cover_image_url,
      },
    },
    { status: 200 },
  );
}

/**
 * DELETE /api/instructor/courses/{id} — deletes a course and, by cascade, every enrollment in it
 * (GitHub #326/#327).
 *
 * What survives, deliberately: the students' own session_log rows, and with them their scores,
 * titles, streaks and activity log. session_log has no course_id — a session belongs to a
 * (user_id, activity_type) pair — so "this course's history" isn't a thing that could be deleted
 * even if it should be, and deleting the enrolled students' sessions outright would wipe their
 * progress in every *other* course too. See deleteCourse's docblock (lib/courseQueries.ts) and
 * #327's own "keep session rows, only remove enrollment and visibility" recommendation.
 *
 * What that costs: GET /api/instructor/courses/{id}/export (REQ-PL-3.4.3) derives its roster from
 * student_course at request time, so the CSV report for this course is gone for good even though
 * every attempt it would have listed still exists. The confirmation dialog
 * (components/DeleteCourseModal.tsx) says so before the instructor commits.
 *
 * unenrolledCount is counted *before* the delete — afterwards the cascade has already removed
 * the rows there would be to count.
 *
 * - 401/403/404/403(not owner) — see authorizeCourse
 * - 200 { courseId, unenrolledCount }
 * - 500 on a roster or delete failure
 */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const authz = await authorizeCourse(request, params.id);
  if (!authz.ok) return authz.response;
  const { supabase } = authz;

  const { students, error: rosterError } = await loadEnrolledStudents(supabase, params.id);
  if (rosterError || !students) {
    return Response.json({ error: rosterError?.message ?? 'Could not load roster.' }, { status: 500 });
  }

  const { error } = await deleteCourse(supabase, params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ courseId: params.id, unenrolledCount: students.length }, { status: 200 });
}
