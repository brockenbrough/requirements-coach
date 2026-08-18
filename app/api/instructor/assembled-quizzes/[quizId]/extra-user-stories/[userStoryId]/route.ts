import { getSupabaseClient } from '../../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../../lib/instructorAuth';
import { findOwnedAssembledQuiz, removeExtraUserStoryFromQuiz } from '../../../../../../../lib/assembledQuizQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * DELETE /api/instructor/assembled-quizzes/{quizId}/extra-user-stories/{userStoryId} — removes a
 * hand-picked prompt from this quiz. The llm-graded counterpart of
 * DELETE .../extra-questions/{questionId}: only the assembled_quiz_extra_user_story row is
 * deleted; the original prompt, its catalog, and every other quiz that references it are
 * untouched. Idempotent, matching DELETE .../excluded-user-stories/{userStoryId}.
 *
 * - 404 quizId matches no quiz
 * - 200 { userStoryId }
 */
export async function DELETE(request: Request, { params }: { params: { quizId: string; userStoryId: string } }) {
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

  const { error } = await removeExtraUserStoryFromQuiz(supabase, found.quiz.assembled_quiz_id, params.userStoryId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ userStoryId: params.userStoryId }, { status: 200 });
}
