import { getSupabaseClient } from '../../../../../lib/supabase';
import { requireInstructor } from '../../../../../lib/instructorAuth';
import {
  getQuizByActivityType,
  listCatalogQuestions,
  listCatalogUserStories,
} from '../../../../../lib/activityTypeQueries';
import { loadTitleLadder } from '../../../../../lib/titleAuthoringQueries';
import { deleteQuestionWithAnswers } from '../../../../../lib/questionAuthoringQueries';

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
 * DELETE /api/instructor/quizzes/:activityType — removes a catalog the caller created, together
 * with its questions (or prompts) and its mastery title ladder.
 *
 * Every foreign key pointing at activity_type — from question, session_log, user_story,
 * assembled_quiz_catalog and title_definition — is declared without an ON DELETE clause, so
 * Postgres defaults them to RESTRICT. The database would simply reject a bare delete. Rather than
 * cascading them all, this route refuses the cases where cascading would destroy something the
 * instructor didn't ask to lose:
 *
 * - Any session_log row → 409. Score, mastery titles and streaks are all *derived* from
 *   session_log at read time (lib/scoreQueries.ts, lib/titleQueries.ts, lib/streakQueries.ts), so
 *   deleting attempt history would silently take points and titles away from students who earned
 *   them. This is the same rule DELETE /api/instructor/questions/{questionId} applies to a
 *   question that has already been answered.
 * - Any assembled_quiz_catalog row → 409. The catalog is composed into a quiz, possibly a
 *   colleague's (assembled quizzes may reference any catalog, not just the caller's), and must not
 *   vanish out of its composition.
 *
 * title_definition is the one FK that does cascade (see supabase/schema.sql), so the ladder needs
 * no explicit delete here — and because "user".selected_title_definition_id is ON DELETE SET NULL,
 * a student wearing one of those titles simply stops wearing it, with no cleanup pass and no
 * orphaned reference.
 *
 * - 401 missing/invalid bearer token
 * - 403 not an instructor, or doesn't own this catalog (no body, 404-then-403 as in GET above)
 * - 404 activityType matches no catalog
 * - 409 the catalog has attempt history, or is composed into an assembled quiz
 * - 200 { activityType, deletedQuestions, deletedPrompts }
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

  // limit(1) rather than a count: the answer is only ever "any or none", and it keeps this from
  // dragging a whole class's session history over the wire just to decide a 409.
  const { data: sessions, error: sessionsError } = await supabase
    .from('session_log')
    .select('session_id')
    .eq('activity_type', activityType)
    .limit(1);

  if (sessionsError) return Response.json({ error: sessionsError.message }, { status: 500 });
  if ((sessions ?? []).length > 0) {
    return Response.json(
      {
        error:
          'Students have already worked on this catalog. Deleting it would remove the scores and titles they earned, so it cannot be deleted.',
      },
      { status: 409 },
    );
  }

  const { data: quizLinks, error: quizLinksError } = await supabase
    .from('assembled_quiz_catalog')
    .select('assembled_quiz_id')
    .eq('activity_type', activityType);

  if (quizLinksError) return Response.json({ error: quizLinksError.message }, { status: 500 });
  const linkCount = (quizLinks ?? []).length;
  if (linkCount > 0) {
    return Response.json(
      {
        error: `This catalog is part of ${linkCount} assembled quiz${linkCount === 1 ? '' : 'zes'}. Remove it there first, then delete it.`,
      },
      { status: 409 },
    );
  }

  let deletedQuestions = 0;
  let deletedPrompts = 0;

  if (quiz.gradingKind === 'llm-graded') {
    const { userStories, error: promptsError } = await listCatalogUserStories(supabase, activityType);
    if (promptsError || !userStories) {
      return Response.json({ error: promptsError?.message ?? 'Could not load prompts.' }, { status: 500 });
    }

    // No session history exists (checked above), so nothing references these prompts — a plain
    // delete by activity_type is enough, unlike the question path's child-before-parent unwind.
    const { error: promptDeleteError } = await supabase
      .from('user_story')
      .delete()
      .eq('activity_type', activityType);

    if (promptDeleteError) return Response.json({ error: promptDeleteError.message }, { status: 500 });
    deletedPrompts = userStories.length;
  } else {
    const { questions, error: questionsError } = await listCatalogQuestions(supabase, activityType);
    if (questionsError || !questions) {
      return Response.json({ error: questionsError?.message ?? 'Could not load questions.' }, { status: 500 });
    }

    // Reuses the same helper the create-and-hand-pick route unwinds with, so the
    // question_to_answer → answer → question order lives in exactly one place.
    for (const question of questions) {
      await deleteQuestionWithAnswers(
        supabase,
        question.id,
        question.answerOptions.map((option) => option.id),
      );
    }
    deletedQuestions = questions.length;
  }

  const { error: deleteError } = await supabase
    .from('activity_type')
    .delete()
    .eq('activity_type', activityType);

  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });

  return Response.json({ activityType, deletedQuestions, deletedPrompts }, { status: 200 });
}
