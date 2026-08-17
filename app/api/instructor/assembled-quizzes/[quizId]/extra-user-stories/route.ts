import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import { addExtraUserStoryToQuiz, findOwnedAssembledQuiz } from '../../../../../../lib/assembledQuizQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/instructor/assembled-quizzes/{quizId}/extra-user-stories — hand-picks one or more
 * prompts directly onto this quiz. The llm-graded counterpart of POST .../extra-questions, same
 * shape: body { userStoryIds: string[] }, doesn't require the prompt's catalog to be one of the
 * quiz's own linked catalogs (that's the entire point, same as the question side — see
 * assembled_quiz_extra_user_story's own header comment in supabase/schema.sql), and inserted one
 * at a time so an already-picked id (23505) doesn't abort the ones after it in the same request.
 *
 * - 400 missing/empty userStoryIds, or any entry isn't a non-empty string
 * - 400 a userStoryId matches no user_story row (23503 on the FK)
 * - 200 { userStoryIds: string[] } — the ids actually newly added; an already-picked id is
 *   silently omitted, matching POST .../extra-questions
 */
export async function POST(request: Request, { params }: { params: { quizId: string } }) {
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

  const found = await findOwnedAssembledQuiz(supabase, params.quizId, guard.user_id);
  if (found.status === 'error') return Response.json({ error: found.error.message }, { status: 500 });
  if (found.status === 'not_found') return Response.json({ error: 'Quiz not found.' }, { status: 404 });
  if (found.status === 'forbidden') return new Response(null, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { userStoryIds } = (body ?? {}) as { userStoryIds?: unknown };
  if (
    !Array.isArray(userStoryIds) ||
    userStoryIds.length === 0 ||
    userStoryIds.some((id) => typeof id !== 'string' || id.trim() === '')
  ) {
    return Response.json({ error: 'userStoryIds must be a non-empty array of user story ids.' }, { status: 400 });
  }

  const added: string[] = [];
  for (const userStoryId of userStoryIds as string[]) {
    const { alreadyPicked, error } = await addExtraUserStoryToQuiz(supabase, found.quiz.assembled_quiz_id, userStoryId);
    if (error) {
      if ((error as { code?: string }).code === '23503') {
        return Response.json({ error: `Prompt ${userStoryId} does not exist.` }, { status: 400 });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }
    if (!alreadyPicked) added.push(userStoryId);
  }

  return Response.json({ userStoryIds: added }, { status: 200 });
}
