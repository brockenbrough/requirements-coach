import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import { validateUserStoryInput } from '../../../../../../lib/userStoryInput';
import { createUserStory, deleteUserStory } from '../../../../../../lib/userStoryAuthoringQueries';
import { addExtraUserStoryToQuiz, findOwnedAssembledQuiz, getExtraUserStorySummary } from '../../../../../../lib/assembledQuizQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/instructor/assembled-quizzes/{quizId}/user-stories — the llm-graded twin of
 * POST /api/instructor/assembled-quizzes/{quizId}/questions: creates a brand-new prompt AND
 * hand-picks it onto this quiz in a single request. Until this existed, an llm-graded quiz's
 * composition page had no "create new" entry point at all — only "Create new question", which
 * only ever created `question` rows.
 *
 * Body is identical to POST /api/instructor/user-stories: { storyText, activityType,
 * difficultyLevel }. activityType is the catalog the new prompt is filed under, chosen by the
 * instructor (defaulted to the quiz's first linked llm-graded catalog when one exists, otherwise
 * every llm-graded catalog the instructor owns — see the composition page's catalogOptionsForNewItem).
 *
 * 400s up front if this quiz's own grading_kind isn't 'llm-graded' — a quiz is locked to one kind
 * at creation (assembled_quiz.grading_kind), and this route only ever creates `user_story` rows.
 * validateUserStoryInput separately enforces that the target catalog itself is llm-graded, the
 * same check POST /api/instructor/user-stories already relies on.
 *
 * One atomic server-side request rather than two chained client calls, same reasoning as the
 * questions route: if the hand-pick insert fails right after the prompt was created, the route
 * deletes what it just created (deleteUserStory) so a failure response always means nothing was
 * left behind.
 *
 * Returns 201 { userStoryId, extraUserStory } — extraUserStory is the same
 * QuizExtraUserStorySummary shape getQuizComposition's `extraUserStories` array already uses, so
 * the composition page can append it straight to local state instead of refetching the whole quiz.
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

  if (found.quiz.grading_kind !== 'llm-graded') {
    return Response.json({ error: 'This quiz can only include LLM-graded prompts.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { storyText, activityType, difficultyLevel } = (body ?? {}) as {
    storyText?: unknown;
    activityType?: unknown;
    difficultyLevel?: unknown;
  };

  const validation = await validateUserStoryInput(supabase, { storyText, activityType, difficultyLevel });
  if (!validation.ok) return validation.response;

  const created = await createUserStory(
    supabase,
    { storyText: validation.storyText, activityType: validation.activityType, difficultyLevel: validation.difficultyLevel },
    guard.user_id,
  );
  if (!created.ok) return Response.json({ error: created.error }, { status: created.status });

  const { error: pickError } = await addExtraUserStoryToQuiz(supabase, found.quiz.assembled_quiz_id, created.userStoryId);
  if (pickError) {
    // The prompt was just created by this same request — nothing else could have referenced it
    // yet, so deleting it here can never affect any other quiz, catalog, or history.
    await deleteUserStory(supabase, created.userStoryId);
    return Response.json({ error: pickError.message }, { status: 500 });
  }

  const { summary } = await getExtraUserStorySummary(supabase, created.userStoryId);

  // The prompt and its hand-pick both already succeeded — a failed *read-back* of the display
  // summary isn't a reason to roll back a fully successful write, so fall back to a summary built
  // from the validated input itself, same fallback the questions route uses.
  const extraUserStory = summary ?? {
    userStoryId: created.userStoryId,
    storyText: validation.storyText,
    level: validation.difficultyLevel,
    catalogActivityType: validation.activityType,
    catalogName: validation.activityType,
  };

  return Response.json({ userStoryId: created.userStoryId, extraUserStory }, { status: 201 });
}
