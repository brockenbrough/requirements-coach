import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import { listQuizzesWithAuthorAndCount } from '../../../../lib/activityTypeQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/quizzes — every quiz in the system (GitHub #347), not just the calling
 * instructor's own: quizzes are globally shared, so an instructor can browse a colleague's and
 * reuse it in their own course instead of rebuilding it from scratch.
 *
 * Not the same thing as GET /api/instructor/quizzes/{activityType}/{difficultyLevel}/questions
 * (a narrower, currently-unused route that returns one instructor's own questions for one
 * (activityType, difficultyLevel) pair) — this route answers "what quizzes exist", that one
 * answers "what are the questions in this one quiz that I own".
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor (no body)
 * - 200 { quizzes: [{ activityType, name, description, authorName, questionCount }] }
 * - 500 Supabase not configured, or the query fails
 *
 * Filtering by professor is left to the client: the quiz count is small enough (built-in plus
 * however many instructors have created) that fetching the full list and filtering in the
 * browser is simpler than adding server-side query params for it.
 */
export async function GET(request: Request) {
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

  const { quizzes, error } = await listQuizzesWithAuthorAndCount(supabase);
  if (error || !quizzes) {
    return Response.json({ error: error?.message ?? 'Could not load quizzes.' }, { status: 500 });
  }

  return Response.json({ quizzes }, { status: 200 });
}
