import { getSupabaseClient } from '../../../../lib/supabase';
import { isActivityType } from '../../../../lib/activityTypes';
import {
  findInProgressSession,
  loadSessionAnswers,
  loadSessionQuestions,
  nextUnansweredPosition,
} from '../../../../lib/sessionQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/sessions/current?activityType=… — resumes a running activity (REQ-PL-2.1).
 *
 * A pure read: the server is already up to date after every answer, so there is no state to
 * hand over and nothing to merge. Picking the work up on a second device, after a reload, or
 * days later is the same request.
 *
 * The response carries the questions without their solutions, plus the answers already given
 * — those may show correct/explanation, because the student has paid for that feedback by
 * committing an answer.
 */
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const searchParams = new URL(request.url).searchParams;
  const activityType = searchParams.get('activityType');
  // Narrows activityType to string for the rest of the function — isActivityType's async check
  // below can no longer double as a type predicate the way the old synchronous version did.
  if (activityType === null) return Response.json({ error: 'Unknown activity type.' }, { status: 400 });

  // GitHub #583: optional — scopes the lookup to a specific quiz when the caller knows one, so
  // two quizzes composed from the same catalog don't resume each other's session.
  const assembledQuizId = searchParams.get('assembledQuizId') ?? undefined;

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { valid: validActivityType, error: activityTypeError } = await isActivityType(supabase, activityType);
  if (activityTypeError) return Response.json({ error: activityTypeError.message }, { status: 500 });
  if (!validActivityType) {
    return Response.json({ error: 'Unknown activity type.' }, { status: 400 });
  }

  // The student id comes from the auth session, never from the query string.
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { session, error: sessionError } = await findInProgressSession(supabase, user.id, activityType, assembledQuizId);
  if (sessionError) return Response.json({ error: sessionError.message }, { status: 500 });

  // Nothing in progress is a normal answer, not a 404: the client offers "start" instead of
  // "continue" and can tell the two apart without inspecting a status code.
  if (!session) {
    return Response.json({ session: null, questions: [], answers: [], nextPosition: null }, { status: 200 });
  }

  const sessionId = (session as { session_id: string }).session_id;

  const [questionResult, answerResult] = await Promise.all([
    loadSessionQuestions(supabase, sessionId),
    loadSessionAnswers(supabase, sessionId),
  ]);

  if (questionResult.error) return Response.json({ error: questionResult.error.message }, { status: 500 });
  if (answerResult.error) return Response.json({ error: answerResult.error.message }, { status: 500 });

  const questions = questionResult.questions ?? [];
  const answers = answerResult.answers ?? [];

  const answeredQuestionIds = new Set(answers.map((answer) => answer.question_id));
  const nextPosition = nextUnansweredPosition(questions, answeredQuestionIds);

  return Response.json(
    {
      session,
      questions,
      answers,
      answeredCount: answeredQuestionIds.size,
      nextPosition,
      completed: nextPosition === null,
    },
    { status: 200 },
  );
}
