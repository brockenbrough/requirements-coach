import { getSupabaseClient } from '../../../../lib/supabase';
import { findCourseByCode, enrollStudentInCourse } from '../../../../lib/courseQueries';

const FOREIGN_KEY_VIOLATION = '23503';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/courses/join — a student links their account to a course by its shareable code
 * (course.course_code, REQ-DL-5) via student_course.
 *
 * Body: { code }. user_id comes from the bearer token, never the body.
 * Idempotent like POST /api/sessions: already belonging to the course is not an error — it
 * just confirms membership (200, not 201).
 *
 * - 401 missing/invalid bearer token
 * - 400 invalid JSON, or missing/blank code
 * - 404 no course has that code
 * - 409 caller is authenticated but has no "user" profile row yet (fk_student_course_user)
 * - 500 Supabase not configured, lookup failure, or any other DB error
 * - 201 { course: { id, name, code, createdAt }, alreadyMember: false } — newly joined
 * - 200 { course: { id, name, code, createdAt }, alreadyMember: true } — already a member
 *
 * UI NOTE: components/StudentCourseCard.tsx still calls lib/mockCourses.ts's joinCourse(token,
 * courseId, studentId, enrollmentKey) — a different, id-in-path, mock-only contract. Wiring the
 * UI to this route is a separate task; see the matching note in lib/mockCourses.ts's header.
 */
export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { code } = (body ?? {}) as { code?: unknown };
  if (typeof code !== 'string' || code.trim() === '') {
    return Response.json({ error: 'code is required.' }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  // generateCourseCode (lib/courseQueries.ts) only ever produces uppercase codes — normalize
  // what the student typed so a lowercase paste or stray space doesn't 404 a valid code.
  const normalizedCode = code.trim().toUpperCase();

  const { course, error: lookupError } = await findCourseByCode(supabase, normalizedCode);
  if (lookupError) return Response.json({ error: lookupError.message }, { status: 500 });
  if (!course) return Response.json({ error: 'Incorrect course code. Check the code and try again.' }, { status: 404 });

  const { alreadyMember, error: enrollError } = await enrollStudentInCourse(supabase, {
    userId: user.id,
    courseId: course.course_id,
  });

  if (enrollError) {
    // student_course.user_id references "user"(user_id): the student is authenticated but has
    // no profile row yet — same failure category as POST /api/sessions's fk_session_log_user
    // case, adapted to this table's own FK constraint name.
    if (enrollError.code === FOREIGN_KEY_VIOLATION && enrollError.message.includes('fk_student_course_user')) {
      return Response.json({ error: 'Create a profile before joining a course.' }, { status: 409 });
    }
    return Response.json({ error: enrollError.message ?? 'Could not join course.' }, { status: 500 });
  }

  return Response.json(
    {
      course: {
        id: course.course_id,
        name: course.course_name,
        code: course.course_code,
        createdAt: course.created_at,
      },
      alreadyMember,
    },
    { status: alreadyMember ? 200 : 201 },
  );
}
