import { getSupabaseClient } from '../../../../../lib/supabase';
import { requireInstructor } from '../../../../../lib/instructorAuth';
import { validateRatingPromptText } from '../../../../../lib/activityTypes';
import {
  deleteCatalog,
  getQuizByActivityType,
  listCatalogQuestions,
  listCatalogUserStories,
  updateCatalogRatingPrompt,
} from '../../../../../lib/activityTypeQueries';
import { loadTitleLadder } from '../../../../../lib/titleAuthoringQueries';

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
 * - 200 { quiz, questions: CatalogQuestion[], userStories: CatalogUserStory[], titles: StoredTitleRung[] }
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

  // The mastery title ladder is catalog-level metadata, not a pool, so it comes back for both
  // grading kinds — an llm-graded catalog earns titles exactly the same way an MCQ one does.
  const { rungs: titles, error: titlesError } = await loadTitleLadder(supabase, activityType);
  if (titlesError || !titles) {
    return Response.json({ error: titlesError?.message ?? 'Could not load titles.' }, { status: 500 });
  }

  if (quiz.gradingKind === 'llm-graded') {
    const { userStories, error: userStoriesError } = await listCatalogUserStories(supabase, activityType);
    if (userStoriesError || !userStories) {
      return Response.json({ error: userStoriesError?.message ?? 'Could not load prompts.' }, { status: 500 });
    }

    return Response.json({ quiz, questions: [], userStories, titles }, { status: 200 });
  }

  const { questions, error: questionsError } = await listCatalogQuestions(supabase, activityType);
  if (questionsError || !questions) {
    return Response.json({ error: questionsError?.message ?? 'Could not load questions.' }, { status: 500 });
  }

  return Response.json({ quiz, questions, userStories: [], titles }, { status: 200 });
}

/**
 * PATCH /api/instructor/quizzes/:activityType — updates an llm-graded catalog's own grading
 * rubric (activity_type.rating_prompt), GitHub #379 follow-up. Same 404-then-403 ownership check
 * as GET/DELETE above. Unlike gradingKind itself, this field is editable any time after creation.
 *
 * Body: { ratingPrompt: string } — validated by validateRatingPromptText (lib/activityTypes.ts),
 * the same rule POST /api/activities/types enforces at creation time.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor, or doesn't own this catalog (no body either way)
 * - 404 activityType matches no catalog
 * - 400 the catalog is 'mcq' (this field is only ever meaningful for 'llm-graded'), or ratingPrompt
 *   is missing/blank/too long
 * - 200 { ratingPrompt }
 * - 500 Supabase not configured, or a query fails
 */
export async function PATCH(request: Request, { params }: { params: { activityType: string } }) {
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

  if (quiz.gradingKind !== 'llm-graded') {
    return Response.json({ error: 'Only an llm-graded catalog has a grading rubric.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { ratingPrompt } = (body ?? {}) as { ratingPrompt?: unknown };
  const validation = validateRatingPromptText(ratingPrompt);
  if (!validation.ok) return validation.response;

  const { ratingPrompt: saved, error: updateError } = await updateCatalogRatingPrompt(
    supabase,
    activityType,
    validation.ratingPrompt,
  );
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  return Response.json({ ratingPrompt: saved }, { status: 200 });
}

/**
 * DELETE /api/instructor/quizzes/:activityType — deletes a catalog the caller owns: its own
 * questions/answers (mcq) or user_story prompts (llm-graded), and unlinks it from every assembled
 * quiz that composed it (deleteCatalog, lib/activityTypeQueries.ts, has the exact cascade). Same
 * 404-then-403 ownership check as GET above.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor, or doesn't own this catalog (no body either way)
 * - 404 activityType matches no catalog
 * - 409 a student has already engaged with this catalog (deleteCatalog's own docblock has the
 *   exact usage this checks) — the catalog is left untouched
 * - 200 { activityType }
 * - 500 Supabase not configured, or a query fails
 */
export async function DELETE(request: Request, { params }: { params: { activityType: string } }) {
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

  const result = await deleteCatalog(supabase, activityType, quiz.gradingKind);
  if (result.status === 'in_use') {
    return Response.json({ error: 'This catalog has already been used by a student and cannot be deleted.' }, { status: 409 });
  }
  if (result.status === 'error') return Response.json({ error: result.error.message }, { status: 500 });

  return Response.json({ activityType }, { status: 200 });
}
