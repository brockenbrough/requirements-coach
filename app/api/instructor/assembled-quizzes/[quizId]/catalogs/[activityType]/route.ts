import { getSupabaseClient } from '../../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../../lib/instructorAuth';
import { getQuizByActivityType } from '../../../../../../../lib/activityTypeQueries';
import {
  findOwnedAssembledQuiz,
  listQuizCatalogActivityTypes,
  listQuizCatalogQuestions,
  listQuizCatalogUserStories,
  unlinkCatalogFromQuiz,
} from '../../../../../../../lib/assembledQuizQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

async function authorize(request: Request, quizId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, response: Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 }) };
  }

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    const response =
      guard.status === 403
        ? new Response(null, { status: 403 })
        : Response.json(
            { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
            { status: guard.status },
          );
    return { ok: false as const, response };
  }

  const found = await findOwnedAssembledQuiz(supabase, quizId, guard.user_id);
  if (found.status === 'error') {
    return { ok: false as const, response: Response.json({ error: found.error.message }, { status: 500 }) };
  }
  if (found.status === 'not_found') {
    return { ok: false as const, response: Response.json({ error: 'Quiz not found.' }, { status: 404 }) };
  }
  if (found.status === 'forbidden') {
    return { ok: false as const, response: new Response(null, { status: 403 }) };
  }

  return { ok: true as const, supabase, quiz: found.quiz };
}

/**
 * GET /api/instructor/assembled-quizzes/{quizId}/catalogs/{activityType} — the "copy of the
 * catalog, in the context of this quiz" view (GitHub #361 requirement 3): the catalog's own
 * metadata plus every one of its questions, each annotated with whether this quiz currently
 * excludes it. Read-only over the questions themselves on purpose — editing or deleting a
 * question happens only through the real catalog (GitHub #359's
 * GET/POST/PATCH/DELETE /api/instructor/questions[/…]), never from here, so the original catalog
 * can never be reached through a quiz's composition screen.
 *
 * Branches on the catalog's grading kind the same way GET /api/instructor/quizzes/{activityType}
 * does — both pools always present, one always empty, rather than a discriminated union. An
 * llm-graded catalog has no `question` rows at all (its content is `user_story`); its prompts are
 * annotated with this quiz's own quiz_excluded_user_story state via listQuizCatalogUserStories,
 * the exact same role listQuizCatalogQuestions plays for the mcq side.
 *
 * - 404 quizId matches no quiz, OR activityType matches no catalog
 * - 200 { catalog: { activityType, name, description, authorName, gradingKind }, questions: QuizScopedQuestion[], userStories: QuizScopedUserStory[] }
 */
export async function GET(request: Request, { params }: { params: { quizId: string; activityType: string } }) {
  const auth = await authorize(request, params.quizId);
  if (!auth.ok) return auth.response;

  const { supabase, quiz } = auth;

  const { quiz: catalog, error: catalogError } = await getQuizByActivityType(supabase, params.activityType);
  if (catalogError) return Response.json({ error: catalogError.message }, { status: 500 });
  if (!catalog) return Response.json({ error: 'Catalog not found.' }, { status: 404 });

  if (catalog.gradingKind === 'llm-graded') {
    const { userStories, error: userStoriesError } = await listQuizCatalogUserStories(supabase, quiz.assembled_quiz_id, params.activityType);
    if (userStoriesError || !userStories) {
      return Response.json({ error: userStoriesError?.message ?? 'Could not load prompts.' }, { status: 500 });
    }
    return Response.json({ catalog, questions: [], userStories }, { status: 200 });
  }

  const { questions, error: questionsError } = await listQuizCatalogQuestions(supabase, quiz.assembled_quiz_id, params.activityType);
  if (questionsError || !questions) {
    return Response.json({ error: questionsError?.message ?? 'Could not load questions.' }, { status: 500 });
  }

  return Response.json({ catalog, questions, userStories: [] }, { status: 200 });
}

/**
 * DELETE /api/instructor/assembled-quizzes/{quizId}/catalogs/{activityType} — removes a catalog
 * from the quiz's composition (GitHub #361 requirement 1). Only the assembled_quiz_catalog link
 * is deleted — the catalog itself, and every question in it, are untouched. Confirmation that
 * this can drop many questions from the quiz is a UI concern (the detail page's confirm dialog),
 * not this route's — the route just performs the unlink once asked.
 *
 * 404 if the catalog was never linked to this quiz in the first place, rather than a silent
 * no-op 200: unlike enrollment removal (GitHub #325's "not idempotent, names a specific
 * caller-owned resource"), the instructor-facing UI always calls this from a row that's currently
 * showing as linked, so a 404 here means the page's own state is stale, worth surfacing.
 */
export async function DELETE(request: Request, { params }: { params: { quizId: string; activityType: string } }) {
  const auth = await authorize(request, params.quizId);
  if (!auth.ok) return auth.response;

  const { supabase, quiz } = auth;

  const { activityTypes, error: listError } = await listQuizCatalogActivityTypes(supabase, quiz.assembled_quiz_id);
  if (listError || !activityTypes) return Response.json({ error: listError?.message ?? 'Could not load quiz catalogs.' }, { status: 500 });
  if (!activityTypes.includes(params.activityType)) {
    return Response.json({ error: 'This catalog is not linked to this quiz.' }, { status: 404 });
  }

  const { error } = await unlinkCatalogFromQuiz(supabase, quiz.assembled_quiz_id, params.activityType);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ activityType: params.activityType }, { status: 200 });
}
