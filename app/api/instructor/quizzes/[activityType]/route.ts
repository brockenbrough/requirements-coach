import { getSupabaseClient } from '../../../../../lib/supabase';
import { requireInstructor } from '../../../../../lib/instructorAuth';
import {
  getQuizByActivityType,
  listCatalogQuestions,
  listCatalogUserStories,
} from '../../../../../lib/activityTypeQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/quizzes/:activityType — one catalog's metadata plus every question it
 * contains (GitHub #359), for the catalog detail page's read-only view. Distinct from
 * GET /api/instructor/quizzes/:activityType/:difficultyLevel/questions (own-questions-only, one
 * level, 403s when the caller owns none of that level) — this route answers "what's in this
 * catalog", scoped the same "mine only" way the browse list is: a catalog is visible here only if
 * creator_id matches the caller, so a built-in or colleague's catalog 403s even though it exists.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor (no body), or is an instructor but doesn't own this catalog
 *   (no body — same 404-then-403 ordering as e.g. lib/courseQueries.ts's findOwnedCourse)
 * - 404 activityType matches no catalog
 * - 200 { quiz, questions: CatalogQuestion[], userStories: CatalogUserStory[] }
 * - 500 Supabase not configured, or either query fails
 *
 * GitHub #379: both pools are always present in the response, one of them empty, rather than a
 * discriminated union keyed on quiz.gradingKind. A catalog only ever fills one pool, so the empty
 * array is never ambiguous, and the client gets to read `quiz.gradingKind` to decide what to
 * render without also having to narrow the response shape. Only the pool matching the kind is
 * queried — the other is returned as [] without a round trip.
 */
export async function GET(request: Request, { params }: { params: { activityType: string } }) {
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

  const { activityType } = params;

  const { quiz, creatorId, error: quizError } = await getQuizByActivityType(supabase, activityType);
  if (quizError) return Response.json({ error: quizError.message }, { status: 500 });
  if (!quiz) return Response.json({ error: 'Catalog not found.' }, { status: 404 });
  if (creatorId !== guard.user_id) return new Response(null, { status: 403 });

  if (quiz.gradingKind === 'llm-graded') {
    const { userStories, error: userStoriesError } = await listCatalogUserStories(supabase, activityType);
    if (userStoriesError || !userStories) {
      return Response.json({ error: userStoriesError?.message ?? 'Could not load prompts.' }, { status: 500 });
    }

    return Response.json({ quiz, questions: [], userStories }, { status: 200 });
  }

  const { questions, error: questionsError } = await listCatalogQuestions(supabase, activityType);
  if (questionsError || !questions) {
    return Response.json({ error: questionsError?.message ?? 'Could not load questions.' }, { status: 500 });
  }

  return Response.json({ quiz, questions, userStories: [] }, { status: 200 });
}
