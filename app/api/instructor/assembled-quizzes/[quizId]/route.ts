import { getSupabaseClient } from '../../../../../lib/supabase';
import { requireInstructor } from '../../../../../lib/instructorAuth';
import {
  deleteAssembledQuiz,
  findOwnedAssembledQuiz,
  getCourseName,
  getQuizComposition,
  updateAssembledQuizRatingPrompt,
} from '../../../../../lib/assembledQuizQueries';
import { validateRatingPromptText } from '../../../../../lib/activityTypes';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/** Shared guard + ownership dance for both handlers below — same shape as app/api/instructor/courses/[id]/route.ts's authorizeCourse. */
async function authorizeQuiz(request: Request, quizId: string) {
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
 * GET /api/instructor/assembled-quizzes/{quizId} — one quiz's full composition (GitHub #361,
 * extended by GitHub #380): meta, every linked catalog with its genuinely-active question count
 * (total minus this quiz's own exclusions), every individually hand-picked question with its
 * source catalog, and per-level coverage against the round size — now counting hand-picked
 * questions too — so the detail page can warn before a level runs short.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor, or isn't this quiz's creator (no body either way)
 * - 404 quizId matches no quiz
 * - 200 { quiz: { id, name, description, courseId, courseName, gradingKind, ratingPrompt }, catalogs, levelCoverage, extraQuestions, extraUserStories, activeCatalogQuestionIds, activeCatalogUserStoryIds }
 * - 500 Supabase not configured, or any of the composition queries fail
 */
export async function GET(request: Request, { params }: { params: { quizId: string } }) {
  const auth = await authorizeQuiz(request, params.quizId);
  if (!auth.ok) return auth.response;

  const { supabase, quiz } = auth;

  const { courseName, error: courseError } = await getCourseName(supabase, quiz.course_id);
  if (courseError) return Response.json({ error: courseError.message }, { status: 500 });

  const {
    catalogs,
    levelCoverage,
    extraQuestions,
    extraUserStories,
    activeCatalogQuestionIds,
    activeCatalogUserStoryIds,
    error: compositionError,
  } = await getQuizComposition(supabase, quiz.assembled_quiz_id);
  if (
    compositionError ||
    !catalogs ||
    !levelCoverage ||
    !extraQuestions ||
    !extraUserStories ||
    !activeCatalogQuestionIds ||
    !activeCatalogUserStoryIds
  ) {
    return Response.json({ error: compositionError?.message ?? 'Could not load quiz composition.' }, { status: 500 });
  }

  return Response.json(
    {
      quiz: {
        id: quiz.assembled_quiz_id,
        name: quiz.quiz_name,
        description: quiz.description,
        courseId: quiz.course_id,
        courseName: courseName ?? 'Unknown course',
        gradingKind: quiz.grading_kind === 'llm-graded' ? 'llm-graded' : 'mcq',
        ratingPrompt: quiz.rating_prompt,
      },
      catalogs,
      levelCoverage,
      extraQuestions,
      extraUserStories,
      activeCatalogQuestionIds,
      activeCatalogUserStoryIds,
    },
    { status: 200 },
  );
}

/**
 * PATCH /api/instructor/assembled-quizzes/{quizId} — sets or revises an llm-graded quiz's grading
 * rubric (assembled_quiz.rating_prompt) after creation. Unlike gradingKind, which POST
 * /api/instructor/assembled-quizzes locks forever, the rubric is meant to be revised: the
 * instructor-facing "Set rubric"/"Edit rubric" affordance on the quiz detail page opens
 * RatingPromptModal, the same popup CreateQuizModal forces open at creation, now saving over the
 * network instead of into local state.
 *
 * Same 404-then-403 ownership check as GET/DELETE above, plus one more: a quiz whose grading_kind
 * isn't 'llm-graded' has no rubric to configure (an MCQ quiz has no LLM grading step at all), so
 * that's a 400, not a silent no-op.
 *
 * Body: { ratingPrompt: string } — required non-blank, capped at MAX_RATING_PROMPT_LENGTH, same
 * validateRatingPromptText the create route uses so the two can't disagree about what's valid.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor, or doesn't own this quiz (no body either way)
 * - 404 quizId matches no quiz
 * - 400 the quiz is 'mcq' (no rubric to set), or ratingPrompt fails validation
 * - 200 { ratingPrompt }
 * - 500 Supabase not configured, or a query fails
 */
export async function PATCH(request: Request, { params }: { params: { quizId: string } }) {
  const auth = await authorizeQuiz(request, params.quizId);
  if (!auth.ok) return auth.response;

  const { supabase, quiz } = auth;

  if (quiz.grading_kind !== 'llm-graded') {
    return Response.json({ error: 'Only an LLM-graded quiz has a grading rubric to set.' }, { status: 400 });
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

  const { ratingPrompt: saved, error: updateError } = await updateAssembledQuizRatingPrompt(
    supabase,
    quiz.assembled_quiz_id,
    validation.ratingPrompt,
  );
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  return Response.json({ ratingPrompt: saved }, { status: 200 });
}

/**
 * DELETE /api/instructor/assembled-quizzes/{quizId} — deletes the quiz (GitHub #361 requirement
 * 5). assembled_quiz_catalog and quiz_excluded_question rows cascade with it (both FK
 * ON DELETE CASCADE); the catalogs, their questions, and every catalog-level question count are
 * untouched.
 *
 * A session_log row can reference this quiz (assembled_quiz_id, which assembled quiz's
 * composition granted the session access — see that column's own comment in
 * supabase/schema.sql), but that FK is ON DELETE SET NULL, not CASCADE: a student's attempt
 * history has nothing to do with whether the quiz that once granted access still exists, so
 * deleting a quiz only clears the link, never the session, score, or answers behind it. There is
 * still no dedicated "play this assembled quiz" route (a student always plays one catalog at a
 * time — see CLAUDE.md), so nothing about a *live* session is at stake here either; a plain hard
 * delete remains complete and correct.
 *
 * Returns 200 with { quizId }.
 */
export async function DELETE(request: Request, { params }: { params: { quizId: string } }) {
  const auth = await authorizeQuiz(request, params.quizId);
  if (!auth.ok) return auth.response;

  const { supabase, quiz } = auth;

  const { error } = await deleteAssembledQuiz(supabase, quiz.assembled_quiz_id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ quizId: quiz.assembled_quiz_id }, { status: 200 });
}
