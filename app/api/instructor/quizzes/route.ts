import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import { listExampleCatalogsWithCount, listQuizzesWithAuthorAndCount } from '../../../../lib/activityTypeQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/quizzes — every quiz the calling instructor created (creator_id =
 * guard.user_id): built-in catalogs and colleagues' catalogs are not included, the same "mine
 * only" convention lib/activityTypeQueries.ts's listOwnedActivityTypes already uses elsewhere.
 *
 * Not the same thing as GET /api/instructor/quizzes/{activityType}/{difficultyLevel}/questions
 * (a narrower, currently-unused route that returns one instructor's own questions for one
 * (activityType, difficultyLevel) pair) — this route answers "what quizzes exist", that one
 * answers "what are the questions in this one quiz that I own".
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor (no body)
 * GitHub #478: also returns exampleCatalogs — the three seeded, ownerless catalogs (creator_id IS
 * NULL) every instructor sees regardless of what they've created themselves, so a first-time
 * instructor has something to look at (and duplicate) before their own "mine only" list has
 * anything in it.
 *
 * - 200 { quizzes: [{ activityType, name, description, authorName, questionCount, isBuiltIn }], exampleCatalogs: [...] }
 * - 500 Supabase not configured, or either query fails
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

  const { quizzes, error } = await listQuizzesWithAuthorAndCount(supabase, guard.user_id);
  if (error || !quizzes) {
    return Response.json({ error: error?.message ?? 'Could not load quizzes.' }, { status: 500 });
  }

  const { quizzes: exampleCatalogs, error: exampleError } = await listExampleCatalogsWithCount(supabase);
  if (exampleError || !exampleCatalogs) {
    return Response.json({ error: exampleError?.message ?? 'Could not load example catalogs.' }, { status: 500 });
  }

  return Response.json({ quizzes, exampleCatalogs }, { status: 200 });
}
