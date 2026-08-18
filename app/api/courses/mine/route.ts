import { getSupabaseClient } from '../../../../lib/supabase';
import { listEnrolledCoursesForStudent } from '../../../../lib/courseQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/courses/mine — every course the caller is actually enrolled in (GitHub #427), backing
 * the student "My Courses" page. Deliberately a separate route from GET /api/courses (browse/join
 * every course with a code): that route excludes courses without a join code, which would hide a
 * course a student was enrolled in directly by their instructor — see
 * listEnrolledCoursesForStudent's own docblock (lib/courseQueries.ts).
 *
 * - 401 missing/invalid bearer token
 * - 200 { courses: [{ id, name, createdAt, professorName, studentCount, alreadyMember: true, semester, coverImageUrl }] }
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

  const { courses, error } = await listEnrolledCoursesForStudent(supabase, user.id);
  if (error || !courses) {
    return Response.json({ error: error?.message ?? 'Could not load your courses.' }, { status: 500 });
  }

  return Response.json(
    {
      courses: courses.map((c) => ({
        id: c.course_id,
        name: c.course_name,
        createdAt: c.created_at,
        professorName: c.professor_name,
        studentCount: c.student_count,
        alreadyMember: c.already_member,
        semester: c.semester,
        coverImageUrl: c.cover_image_url,
      })),
    },
    { status: 200 },
  );
}
