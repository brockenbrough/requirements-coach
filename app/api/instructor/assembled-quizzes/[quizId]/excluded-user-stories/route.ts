import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import { excludeUserStoryFromQuiz, findOwnedAssembledQuiz, listQuizCatalogActivityTypes } from '../../../../../../lib/assembledQuizQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/instructor/assembled-quizzes/{quizId}/excluded-user-stories — excludes one prompt
 * from this quiz's draw pool. The llm-graded counterpart of POST .../excluded-questions, same
 * shape throughout: body { userStoryId }, only inserts a quiz_excluded_user_story row (never
 * touches `user_story` itself — see that table's comment in supabase/schema.sql), and the prompt
 * must belong to one of the quiz's own linked catalogs.
 *
 * - 404 quizId matches no quiz
 * - 400 missing userStoryId, or the prompt doesn't belong to any catalog this quiz is linked to
 * - 200 { userStoryId } — 200 not 201: excluding an already-excluded prompt is a no-op success
 *   (uq_quiz_excluded_user_story), not a second resource created
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

  const { userStoryId } = (body ?? {}) as { userStoryId?: unknown };
  if (typeof userStoryId !== 'string' || userStoryId.trim() === '') {
    return Response.json({ error: 'userStoryId is required.' }, { status: 400 });
  }

  const { activityTypes, error: catalogsError } = await listQuizCatalogActivityTypes(supabase, found.quiz.assembled_quiz_id);
  if (catalogsError || !activityTypes) {
    return Response.json({ error: catalogsError?.message ?? 'Could not load quiz catalogs.' }, { status: 500 });
  }

  const { data: storyRow, error: storyError } = await supabase
    .from('user_story')
    .select('user_story_id, activity_type')
    .eq('user_story_id', userStoryId)
    .maybeSingle();

  if (storyError) return Response.json({ error: storyError.message }, { status: 500 });
  if (!storyRow || !activityTypes.includes((storyRow as { activity_type: string }).activity_type)) {
    return Response.json({ error: 'This prompt is not part of this quiz.' }, { status: 400 });
  }

  const { error } = await excludeUserStoryFromQuiz(supabase, found.quiz.assembled_quiz_id, userStoryId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ userStoryId }, { status: 200 });
}
