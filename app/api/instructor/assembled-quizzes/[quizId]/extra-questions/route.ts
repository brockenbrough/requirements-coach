import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import { addExtraQuestionToQuiz, findOwnedAssembledQuiz } from '../../../../../../lib/assembledQuizQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/instructor/assembled-quizzes/{quizId}/extra-questions — hand-picks one or more
 * questions directly onto this quiz (GitHub #380). Body: { questionIds: string[] }.
 *
 * Unlike POST .../excluded-questions, a hand-picked question does NOT need to belong to one of
 * the quiz's own linked catalogs — that's the entire point of #380
 * (assembled_quiz_extra_question's own header comment in supabase/schema.sql): pulling in one
 * question never requires linking its whole catalog. The only real constraint is that questionId
 * names an actual question row, enforced by fk_assembled_quiz_extra_question_question (a bogus id
 * surfaces here as a 400, not a 500).
 *
 * Inserted one at a time via addExtraQuestionToQuiz rather than a single batch insert, so a
 * question that's already hand-picked (23505) doesn't abort the ones after it in the same
 * request — each pick is independently idempotent, matching excludeQuestionFromQuiz's own
 * per-question idempotency. The picker modal already hides already-included questions, so a
 * duplicate pick here is a stale-client edge case, not the common path.
 *
 * - 400 missing/empty questionIds, or any entry isn't a non-empty string
 * - 400 a questionId matches no question row (23503 on the FK)
 * - 200 { questionIds: string[] } — the ids actually newly added; an already-picked id is
 *   silently omitted from the list, not reported as an error (same "no-op success" shape
 *   POST .../excluded-questions uses)
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

  const { questionIds } = (body ?? {}) as { questionIds?: unknown };
  if (
    !Array.isArray(questionIds) ||
    questionIds.length === 0 ||
    questionIds.some((id) => typeof id !== 'string' || id.trim() === '')
  ) {
    return Response.json({ error: 'questionIds must be a non-empty array of question ids.' }, { status: 400 });
  }

  const added: string[] = [];
  for (const questionId of questionIds as string[]) {
    const { alreadyPicked, error } = await addExtraQuestionToQuiz(supabase, found.quiz.assembled_quiz_id, questionId);
    if (error) {
      if ((error as { code?: string }).code === '23503') {
        return Response.json({ error: `Question ${questionId} does not exist.` }, { status: 400 });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }
    if (!alreadyPicked) added.push(questionId);
  }

  return Response.json({ questionIds: added }, { status: 200 });
}
