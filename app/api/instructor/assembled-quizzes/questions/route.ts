import { getSupabaseClient } from '../../../../../lib/supabase';
import { requireInstructor } from '../../../../../lib/instructorAuth';
import { listAllQuestionsForPicker, listAllUserStoriesForPicker } from '../../../../../lib/assembledQuizQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/assembled-quizzes/questions — every MCQ question and every llm-graded
 * prompt the calling instructor created, any of their own catalogs (GitHub #380, extended with
 * llm-graded parity). Backs the "Add individual questions" picker (AddQuizQuestionsModal), which
 * searches/filters this list client-side and renders the two kinds as separately-labeled,
 * separately-selectable sections — the same "fetch once, filter in the browser" choice
 * GET /api/instructor/quizzes' browse table already makes for catalogs.
 *
 * Both pools are always present in the response, one possibly empty, the same convention the
 * catalog detail routes use — not a discriminated union, since the modal shows both kinds at once
 * rather than picking one.
 *
 * Deliberately not nested under {quizId} even though its only caller today is quiz composition:
 * the list itself isn't quiz-scoped (which items are already in a given quiz is computed by the
 * client from that quiz's own already-loaded composition), and a static `questions` segment next
 * to the dynamic `[quizId]` one is a supported Next.js route shape — the same reasoning
 * app/instructor/assembled-quizzes/[quizId]/catalogs/[activityType]/page.tsx's nesting already
 * relies on elsewhere in this feature.
 *
 * Scoped to `creator_id = guard.user_id` for both pools, the same "mine only" convention
 * GET /api/instructor/quizzes and GET /api/instructor/questions already use — a colleague's or a
 * built-in catalog's content isn't this instructor's to hand-pick onto their own quiz.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor (no body)
 * - 200 { questions: PickableQuestion[], userStories: PickableUserStory[] }
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

  const { questions, error: questionsError } = await listAllQuestionsForPicker(supabase, guard.user_id);
  if (questionsError || !questions) {
    return Response.json({ error: questionsError?.message ?? 'Could not load questions.' }, { status: 500 });
  }

  const { userStories, error: userStoriesError } = await listAllUserStoriesForPicker(supabase, guard.user_id);
  if (userStoriesError || !userStories) {
    return Response.json({ error: userStoriesError?.message ?? 'Could not load prompts.' }, { status: 500 });
  }

  return Response.json({ questions, userStories }, { status: 200 });
}
