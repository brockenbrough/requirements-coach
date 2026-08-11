import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import { createCourseWithUniqueCode } from '../../../../lib/courseQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/instructor/courses — creates a course (REQ-DL-5) and generates its unique,
 * shareable join code server-side (never client-supplied).
 *
 * Body: { name }. creator_id comes from guard.user_id, never the body — see lib/instructorAuth.ts.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor (no body, matching requireInstructor's convention)
 * - 400 invalid JSON, or missing/blank name
 * - 201 { course: { id, name, code, createdAt } }
 * - 500 Supabase not configured, a non-collision insert error, or every code attempt collided
 */
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json(
          { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
          { status: guard.status },
        );
  }

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

  const { course, error } = await createCourseWithUniqueCode(supabase, {
    name: name.trim(),
    creatorId: guard.user_id,
  });

  if (error || !course) {
    return Response.json({ error: error?.message ?? 'Could not create course.' }, { status: 500 });
  }

  return Response.json(
    {
      course: {
        id: course.course_id,
        name: course.course_name,
        code: course.course_code,
        createdAt: course.created_at,
      },
    },
    { status: 201 },
  );
}
