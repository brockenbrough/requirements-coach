import { getSupabaseClient } from '../../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../../lib/instructorAuth';
import { findOwnedAssembledQuiz, removeExtraQuestionFromQuiz } from '../../../../../../../lib/assembledQuizQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * DELETE /api/instructor/assembled-quizzes/{quizId}/extra-questions/{questionId} — removes a
 * hand-picked question from this quiz (GitHub #380). Only the assembled_quiz_extra_question row
 * is deleted; the original question row, its catalog, and every other quiz that references it are
 * untouched. Idempotent: removing a question that isn't currently hand-picked is still 200,
 * matching DELETE .../excluded-questions/{questionId}.
 *
 * - 404 quizId matches no quiz
 * - 200 { questionId }
 */
export async function DELETE(request: Request, { params }: { params: { quizId: string; questionId: string } }) {
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

  const { error } = await removeExtraQuestionFromQuiz(supabase, found.quiz.assembled_quiz_id, params.questionId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ questionId: params.questionId }, { status: 200 });
}
