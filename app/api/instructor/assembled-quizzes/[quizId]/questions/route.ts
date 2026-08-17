import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import {
  createQuestionWithAnswers,
  deleteQuestionWithAnswers,
  validateQuestionInput,
  type QuestionInputBody,
} from '../../../../../../lib/questionAuthoringQueries';
import { addExtraQuestionToQuiz, findOwnedAssembledQuiz, getExtraQuestionSummary } from '../../../../../../lib/assembledQuizQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/instructor/assembled-quizzes/{quizId}/questions — creates a brand-new question AND
 * hand-picks it onto this quiz in a single request (GitHub #380's "create new question directly
 * from the composition view" extension).
 *
 * Body is identical to POST /api/instructor/questions: { questionPrompt, activityType,
 * difficultyLevel, answers }. activityType is the catalog the new question is filed under — a
 * question must always belong to a catalog, so the composition page's reused QuestionFormModal
 * always sends one the instructor actively chose (defaulted to the quiz's first linked catalog
 * when one exists, otherwise a required, un-defaulted choice from every catalog in the system —
 * see AddQuizQuestionsModal's "Create new question" entry point for how that default is picked).
 *
 * One atomic server-side request rather than two chained client calls (create-question, then
 * hand-pick) specifically to avoid the half-finished state a chain risks: a client that creates
 * the question but then loses its connection, navigates away, or hits a transient error on the
 * second call would leave a real, gradeable question sitting in its catalog that nothing ever
 * surfaces on this quiz — discoverable only by an instructor who happens to browse that catalog
 * directly, not by anyone looking at this quiz. Doing both steps here means the *route* owns the
 * fixup: if hand-picking fails after the question was created, the route deletes what it just
 * created (deleteQuestionWithAnswers) so a failure response always means nothing was left behind,
 * the same rollback-by-hand discipline createAssembledQuiz and POST /api/instructor/questions
 * itself already follow (no Supabase JS transaction exists to lean on instead).
 *
 * 400s up front if this quiz's own grading_kind isn't 'mcq' — a quiz is locked to one kind at
 * creation (assembled_quiz.grading_kind), and this route only ever creates `question` rows.
 *
 * Returns 201 { questionId, answerIds, extraQuestion } — extraQuestion is the same
 * QuizExtraQuestionSummary shape getQuizComposition's `extraQuestions` array already uses, so the
 * composition page can append it straight to local state instead of refetching the whole quiz.
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

  if (found.quiz.grading_kind !== 'mcq') {
    return Response.json({ error: 'This quiz can only include multiple-choice questions.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const validation = await validateQuestionInput(supabase, (body ?? {}) as QuestionInputBody);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: validation.status });

  const created = await createQuestionWithAnswers(supabase, validation.data, guard.user_id);
  if (!created.ok) return Response.json({ error: created.error }, { status: created.status });

  const { error: pickError } = await addExtraQuestionToQuiz(supabase, found.quiz.assembled_quiz_id, created.questionId);
  if (pickError) {
    // The question was just created by this same request — nothing else could have referenced it
    // yet, so deleting it here can never affect any other quiz, catalog, or history.
    await deleteQuestionWithAnswers(supabase, created.questionId, created.answerIds);
    return Response.json({ error: pickError.message }, { status: 500 });
  }

  const { summary } = await getExtraQuestionSummary(supabase, created.questionId);

  // The question and its hand-pick both already succeeded — a failed *read-back* of the display
  // summary isn't a reason to roll back a fully successful write, so fall back to a summary built
  // from the validated input itself (catalogName falls back to the activityType key, same fallback
  // getExtraQuestionSummary/listAllQuestionsForPicker use when the join comes back empty).
  const extraQuestion = summary ?? {
    questionId: created.questionId,
    questionText: validation.data.questionPrompt.trim(),
    level: validation.data.difficultyLevel,
    catalogActivityType: validation.data.activityType,
    catalogName: validation.data.activityType,
  };

  return Response.json({ questionId: created.questionId, answerIds: created.answerIds, extraQuestion }, { status: 201 });
}
