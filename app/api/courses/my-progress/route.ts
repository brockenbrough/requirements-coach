import { getSupabaseClient } from '../../../../lib/supabase';
import { computeMyCoursesQuizProgress } from '../../../../lib/courseQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/courses/my-progress — the calling student's own quiz-completion percentage for every
 * course they're enrolled in (GitHub #435), backing the "Quiz progress" bar on the "My Courses"
 * page's course cards (app/activities/page.tsx). The student-facing counterpart to
 * GET /api/instructor/courses/class-stats, scoped to one student's own attempts instead of a whole
 * roster. Deliberately a separate route from GET /api/courses/mine (course metadata + roster size,
 * no progress) rather than folded into it — app/courses/[id]/page.tsx also reads /mine and has no
 * use for this aggregate, since it already renders each quiz's own status individually.
 *
 * - 401 missing/invalid bearer token
 * - 200 { progress: [{ courseId, hasQuizzes, totalQuizzes, passedQuizzes, progressPercent }] } — []
 *   if the student isn't enrolled in anything
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

  const { progress, error } = await computeMyCoursesQuizProgress(supabase, user.id);
  if (error || !progress) {
    return Response.json({ error: error?.message ?? 'Could not load your quiz progress.' }, { status: 500 });
  }

  return Response.json({ progress }, { status: 200 });
}
