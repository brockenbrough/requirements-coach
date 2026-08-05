import { getSupabaseClient } from '../../../../../lib/supabase';
import { SESSION_COLUMNS, isPassing, scoreForAnswer } from '../../../../../lib/sessionRules';
import {
  type SessionPosition,
  type SupabaseClient,
  loadSessionPositions,
  nextUnansweredPosition,
} from '../../../../../lib/sessionQueries';

const UNIQUE_VIOLATION = '23505';

// What a caller needs to identify the record it just created (REQ-DL-4.1). user_id is left
// out on purpose — it is the requesting student's own id, a filter rather than payload.
const ANSWER_LOG_COLUMNS = 'log_id, session_id, question_id, submitted_option, score, submitted_at';

type SessionRow = {
  session_id: string;
  status: string;
  cumulative_score: number;
  max_score: number;
};

type SubmittedOption = { answer_id: string; is_correct: boolean; explanation: string | null };

type AnswerLogRow = {
  log_id: string;
  session_id: string;
  question_id: string;
  submitted_option: string;
  score: number;
  submitted_at: string;
};

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/sessions/{sessionId}/answers — records one answer and reveals the result.
 *
 * Write-through: the answer is committed first, the outcome is disclosed second. Handing out
 * is_correct before the answer is locked in would make the solution readable in the browser.
 *
 * The score is not sent by the client. It is looked up from the answer bank, written to
 * answered_question_log, and rolled up into session_log.cumulative_score by
 * trg_answered_question_log_score inside the same transaction as the insert.
 */
export async function POST(request: Request, { params }: { params: { sessionId: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { questionId, selectedOptionId } = (body ?? {}) as {
    questionId?: unknown;
    selectedOptionId?: unknown;
  };

  if (typeof questionId !== 'string' || typeof selectedOptionId !== 'string') {
    return Response.json(
      { error: 'questionId and selectedOptionId are required.' },
      { status: 400 },
    );
  }

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  // The student id comes from the auth session, never from the request body.
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { sessionId } = params;

  // Scoping the lookup by user_id is what keeps one student out of another's session:
  // a foreign session id is indistinguishable from a non-existent one.
  const { data: session, error: sessionError } = await supabase
    .from('session_log')
    .select(SESSION_COLUMNS)
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (sessionError) return Response.json({ error: sessionError.message }, { status: 500 });
  if (!session) return Response.json({ error: 'Session not found.' }, { status: 404 });

  if ((session as SessionRow).status !== 'in-progress') {
    return Response.json(
      { error: `Session is ${(session as SessionRow).status}.`, session },
      { status: 409 },
    );
  }

  const { positions: sessionQuestions, error: questionsError } =
    await loadSessionPositions(supabase, sessionId);

  if (questionsError) return Response.json({ error: questionsError.message }, { status: 500 });

  const asked = sessionQuestions.find((row) => row.question_id === questionId);

  // Without this check any question from the bank could be smuggled into a running session.
  if (!asked) {
    return Response.json({ error: 'Question does not belong to this session.' }, { status: 400 });
  }

  // Reject options belonging to a different question. Answer ids are visible to the client,
  // so without this a correct option from another question would score points here.
  const { data: optionRow, error: optionError } = await supabase
    .from('question_to_answer')
    .select('answer:answer_id ( answer_id, is_correct, explanation )')
    .eq('question_id', questionId)
    .eq('answer_id', selectedOptionId)
    .maybeSingle();

  if (optionError) return Response.json({ error: optionError.message }, { status: 500 });

  const option = (optionRow as { answer: SubmittedOption | null } | null)?.answer;
  if (!option) {
    return Response.json(
      { error: 'Selected option does not belong to this question.' },
      { status: 400 },
    );
  }

  const { data: questionRow, error: maxScoreError } = await supabase
    .from('question')
    .select('max_score')
    .eq('question_id', questionId)
    .maybeSingle();

  if (maxScoreError) return Response.json({ error: maxScoreError.message }, { status: 500 });

  const score = scoreForAnswer(option.is_correct, (questionRow as { max_score: number | null } | null)?.max_score ?? null);

  const logRow = {
    log_id: crypto.randomUUID(),
    session_id: sessionId,
    user_id: user.id,
    question_id: questionId,
    submitted_option: option.answer_id,
    score,
  };

  // The written row is read back rather than assumed: submitted_at is a database default
  // (now()), so REQ-DL-4.1's timestamp only exists after the insert — neither the client nor
  // this route can supply it. The column list stays explicit for the same reason
  // COMPLETED_ATTEMPT_COLUMNS is: user_id is the filter here, not part of the payload.
  const { data: inserted, error: insertError } = await supabase
    .from('answered_question_log')
    .insert(logRow)
    .select(ANSWER_LOG_COLUMNS)
    .maybeSingle();

  if (insertError) {
    // uq_answered_question_log_session_question: this question was already answered.
    // First write wins — report the current state instead of scoring it twice.
    if (insertError.code === UNIQUE_VIOLATION) {
      const { session: current, answeredCount, nextPosition } =
        await loadProgress(supabase, sessionId, sessionQuestions);
      return Response.json(
        {
          error: 'This question has already been answered.',
          session: current,
          answeredCount,
          nextPosition,
        },
        { status: 409 },
      );
    }
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  // Re-read rather than compute locally: cumulative_score was raised by the trigger, and a
  // parallel submission from another device may have raised it further.
  const progress = await loadProgress(supabase, sessionId, sessionQuestions);
  if (progress.error) return Response.json({ error: progress.error }, { status: 500 });

  const finished = progress.nextPosition === null
    ? await completeSession(supabase, sessionId, progress.session as SessionRow)
    : progress.session;

  return Response.json(
    {
      answer: answerRecord(inserted as AnswerLogRow | null, logRow),
      correct: option.is_correct,
      explanation: option.explanation,
      score,
      session: finished,
      answeredCount: progress.answeredCount,
      nextPosition: progress.nextPosition,
      completed: progress.nextPosition === null,
    },
    { status: 201 },
  );
}

/**
 * The answer log record as the client sees it (REQ-DL-4.1), camelCased like FeedbackResult.
 *
 * `written` is what the insert echoed back; `sent` is what we asked it to store. They only
 * differ if the echo is missing, which the insert succeeding says should not happen — but if
 * it ever does, the row is committed all the same. Failing the request at that point would
 * tell the student their answer was not recorded while it was, and their retry would come
 * back as a 409. So the request stands and only submittedAt, the one value that exists solely
 * in the database, is reported as unknown.
 */
function answerRecord(written: AnswerLogRow | null, sent: Omit<AnswerLogRow, 'submitted_at'>) {
  const row = written ?? sent;

  return {
    logId: row.log_id,
    sessionId: row.session_id,
    questionId: row.question_id,
    selectedOptionId: row.submitted_option,
    score: row.score,
    submittedAt: written?.submitted_at ?? null,
  };
}

/**
 * Current session state plus the next unanswered position.
 *
 * The next question is derived, never stored: it is the lowest position in
 * session_to_question without a row in answered_question_log. Two devices therefore cannot
 * disagree about where the student is — there is no pointer to merge.
 */
async function loadProgress(
  supabase: SupabaseClient,
  sessionId: string,
  sessionQuestions: SessionPosition[],
) {
  const [{ data: session, error: sessionError }, { data: answeredRows, error: answeredError }] =
    await Promise.all([
      supabase.from('session_log').select(SESSION_COLUMNS).eq('session_id', sessionId).maybeSingle(),
      supabase.from('answered_question_log').select('question_id').eq('session_id', sessionId),
    ]);

  const error = sessionError?.message ?? answeredError?.message ?? null;

  const answered = new Set(((answeredRows ?? []) as { question_id: string }[]).map((r) => r.question_id));

  return {
    session,
    answeredCount: answered.size,
    nextPosition: nextUnansweredPosition(sessionQuestions, answered),
    error,
  };
}

/**
 * Closes out the session after the last answer. status and passed are decided here, never by
 * the client. The status guard keeps a parallel request from completing it twice.
 */
async function completeSession(supabase: SupabaseClient, sessionId: string, session: SessionRow) {
  const { data, error } = await supabase
    .from('session_log')
    .update({
      status: 'completed',
      ended_at: new Date().toISOString(),
      passed: isPassing(session.cumulative_score, session.max_score),
    })
    .eq('session_id', sessionId)
    .eq('status', 'in-progress')
    .select(SESSION_COLUMNS)
    .maybeSingle();

  // No row came back because someone else completed it first — their version is authoritative.
  if (error || !data) return session;
  return data;
}
