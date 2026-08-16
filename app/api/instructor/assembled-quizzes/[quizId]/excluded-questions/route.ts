import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import { excludeQuestionFromQuiz, findOwnedAssembledQuiz, listQuizCatalogActivityTypes } from '../../../../../../lib/assembledQuizQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/instructor/assembled-quizzes/{quizId}/excluded-questions — excludes one question from
 * this quiz's draw pool (GitHub #361 requirement 3). Body: { questionId }.
 *
 * Never touches `question`/`answer` — only inserts a quiz_excluded_question row, which is what
 * makes the original catalog provably unaffected (see that table's comment in
 * supabase/schema.sql). The question must belong to one of the quiz's own linked catalogs; a
 * question from a catalog this quiz doesn't even draw from has nothing to exclude it from.
 *
 * - 404 quizId matches no quiz
 * - 400 missing questionId, or the question doesn't belong to any catalog this quiz is linked to
 * - 200 { questionId } — 200 not 201: excluding an already-excluded question is a no-op success
 *   (uq_quiz_excluded_question), not a second resource created
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

  const { questionId } = (body ?? {}) as { questionId?: unknown };
  if (typeof questionId !== 'string' || questionId.trim() === '') {
    return Response.json({ error: 'questionId is required.' }, { status: 400 });
  }

  const { activityTypes, error: catalogsError } = await listQuizCatalogActivityTypes(supabase, found.quiz.assembled_quiz_id);
  if (catalogsError || !activityTypes) {
    return Response.json({ error: catalogsError?.message ?? 'Could not load quiz catalogs.' }, { status: 500 });
  }

  const { data: questionRow, error: questionError } = await supabase
    .from('question')
    .select('question_id, activity_type')
    .eq('question_id', questionId)
    .maybeSingle();

  if (questionError) return Response.json({ error: questionError.message }, { status: 500 });
  if (!questionRow || !activityTypes.includes((questionRow as { activity_type: string }).activity_type)) {
    return Response.json({ error: 'This question is not part of this quiz.' }, { status: 400 });
  }

  const { error } = await excludeQuestionFromQuiz(supabase, found.quiz.assembled_quiz_id, questionId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ questionId }, { status: 200 });
}
