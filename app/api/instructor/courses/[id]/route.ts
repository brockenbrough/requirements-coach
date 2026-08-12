import { getSupabaseClient } from '../../../../../lib/supabase';
import { requireInstructor } from '../../../../../lib/instructorAuth';
import { findOwnedCourse, loadEnrolledStudents, updateCourseName } from '../../../../../lib/courseQueries';
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
 * - 200 { course: { id, name, code, createdAt }, students: [...] }
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
      course: { id: course.course_id, name: course.course_name, code: course.course_code, createdAt: course.created_at },
      students,
    },
    { status: 200 },
  );
}

/**
 * PATCH /api/instructor/courses/{id} — renames a course.
 *
 * Body: { name }.
 * - 401/403/404/403(not owner) — see authorizeCourse
 * - 400 invalid JSON, or missing/blank name
 * - 200 { course: { id, name, code, createdAt } }
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

  const { name } = (body ?? {}) as { name?: unknown };
  if (typeof name !== 'string' || name.trim() === '') {
    return Response.json({ error: 'name is required.' }, { status: 400 });
  }

  const { course: updated, error } = await updateCourseName(supabase, { courseId: params.id, name: name.trim() });
  if (error || !updated) {
    return Response.json({ error: error?.message ?? 'Could not update course.' }, { status: 500 });
  }

  return Response.json(
    { course: { id: updated.course_id, name: updated.course_name, code: updated.course_code, createdAt: updated.created_at } },
    { status: 200 },
  );
}
