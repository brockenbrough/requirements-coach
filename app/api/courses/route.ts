import { getSupabaseClient } from '../../../lib/supabase';
import { listJoinableCourses } from '../../../lib/courseQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/courses — every course a student can self-enroll in by its shareable code
 * (course_code IS NOT NULL; a codeless course is instructor-assigned only, REQ-DL-5). Not
 * instructor-scoped — any authenticated user can browse, same as POST /api/courses/join.
 *
 * - 401 missing/invalid bearer token
 * - 200 { courses: [{ id, name, code, createdAt, professorName, studentCount, alreadyMember }] }
 * - 500 Supabase not configured, or any query failure
 */
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { courses, error } = await listJoinableCourses(supabase, user.id);
  if (error || !courses) {
    return Response.json({ error: error?.message ?? 'Could not load courses.' }, { status: 500 });
  }

  return Response.json(
    {
      courses: courses.map((c) => ({
        id: c.course_id,
        name: c.course_name,
        code: c.course_code,
        createdAt: c.created_at,
        professorName: c.professor_name,
        studentCount: c.student_count,
        alreadyMember: c.already_member,
      })),
    },
    { status: 200 },
  );
}
