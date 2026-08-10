import { getSupabaseClient } from '../../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../../lib/instructorAuth';
import { isActivityType } from '../../../../../../../lib/activityTypes';

// REQ-DL-1.1: valid difficulty levels are 1 (easy), 2 (medium), 3 (hard) — mirrors
// ck_question_difficulty_level in supabase/schema.sql.
const VALID_DIFFICULTY_LEVELS = [1, 2, 3];

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

type AnswerRow = { answer_id: string; option_text: string; is_correct: boolean };
type QuestionRow = {
  question_id: string;
  question_prompt: string;
  user_id: string | null;
  question_to_answer: { answer: AnswerRow | null }[] | null;
};

/**
 * GET /api/instructor/quizzes/:activityType/:difficultyLevel/questions — every question and
 * answer of one quiz "owned" by the calling instructor.
 *
 * A "quiz" has no table of its own (see the Three half-connected worlds note in CLAUDE.md): it
 * is the (activityType, difficultyLevel) pair, and "created by" this instructor means
 * question.user_id (GitHub #201) matches the caller for at least one question in that pair —
 * this is the "scope to my quiz's questions" read GitHub #116 anticipated.
 *
 * - 401: caller is not authenticated (requireInstructor)
 * - 403: caller is authenticated but not an instructor, OR the quiz exists but none of its
 *        questions were created by the caller (both answer with no body, matching the 403
 *        shape GitHub #169 already established for requireInstructor)
 * - 404: activityType/difficultyLevel is not a real quiz — no question anywhere has that pair
 * - 500: Supabase is not configured, or the query fails
 *
 * Only the caller's own questions are returned — a quiz's (activityType, difficultyLevel) pair
 * can otherwise mix questions from multiple authors (or none, for the seeded bank), and there is
 * no other notion of "this instructor's quiz" for those to belong to.
 */
export async function GET(
  request: Request,
  { params }: { params: { activityType: string; difficultyLevel: string } },
) {
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
  const difficultyLevel = Number(params.difficultyLevel);

  // An unknown activityType or an out-of-range difficultyLevel can never match a real question,
  // so it is indistinguishable from "this quiz does not exist" — no separate 400 branch needed.
  if (!isActivityType(activityType) || !VALID_DIFFICULTY_LEVELS.includes(difficultyLevel)) {
    return Response.json({ error: 'Quiz not found.' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('question')
    .select('question_id, question_prompt, user_id, question_to_answer ( answer:answer_id ( answer_id, option_text, is_correct ) )')
    .eq('activity_type', activityType)
    .eq('difficulty_level', difficultyLevel);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const allQuestions = (data ?? []) as unknown as QuestionRow[];
  if (allQuestions.length === 0) {
    return Response.json({ error: 'Quiz not found.' }, { status: 404 });
  }

  const ownQuestions = allQuestions.filter((question) => question.user_id === guard.user_id);
  if (ownQuestions.length === 0) {
    return new Response(null, { status: 403 });
  }

  const questions = ownQuestions.map((question) => ({
    question_id: question.question_id,
    question_title: question.question_prompt,
    answers: (question.question_to_answer ?? [])
      .map((link) => link.answer)
      .filter((answer): answer is AnswerRow => answer !== null)
      .map((answer) => ({
        answer_id: answer.answer_id,
        answer_title: answer.option_text,
        is_correct: answer.is_correct,
      })),
  }));

  return Response.json({ activityType, difficultyLevel, questions }, { status: 200 });
}
