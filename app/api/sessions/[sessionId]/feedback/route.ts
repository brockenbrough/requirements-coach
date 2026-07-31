import { getSupabaseClient } from '../../../../../lib/supabase';
import { loadQuestionOptions } from '../../../../../lib/sessionQueries';

type AnsweredLogRow = { answer_id: string; score: number; submitted_at: string };

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/sessions/{sessionId}/feedback — feedback for one submitted answer
 * (REQ-PL-2.4, REQ-PL-2.5).
 *
 * Takes the question and the option the student picked, grades the option server side and
 * hands back the explanation for it. When the pick was wrong the correct option and its
 * explanation come with it, so the student can see what they should have chosen; when it was
 * right there is nothing else to reveal, so only that one explanation is returned.
 *
 * The route reads, it never writes: the answer must already be in answered_question_log
 * (POST .../answers). Serving feedback for an option that was not committed would turn this
 * endpoint into a way to try every option until is_correct comes back true — which is exactly
 * what the answers route avoids by writing before it discloses.
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

  // Scoping by user_id is what keeps one student out of another's feedback: a foreign
  // session id is indistinguishable from a non-existent one.
  const { data: session, error: sessionError } = await supabase
    .from('session_log')
    .select('session_id')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (sessionError) return Response.json({ error: sessionError.message }, { status: 500 });
  if (!session) return Response.json({ error: 'Session not found.' }, { status: 404 });

  // The log is the authority on what was submitted. Filtering on answer_id as well means a
  // selection the student never made has no record, and looks like any other missing one.
  const { data: log, error: logError } = await supabase
    .from('answered_question_log')
    .select('answer_id, score, submitted_at')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .eq('question_id', questionId)
    .eq('answer_id', selectedOptionId)
    .maybeSingle();

  if (logError) return Response.json({ error: logError.message }, { status: 500 });
  if (!log) {
    return Response.json(
      { error: 'No answered question log record for this question and option.' },
      { status: 404 },
    );
  }

  const { options, error: optionsError } = await loadQuestionOptions(supabase, questionId);
  if (optionsError) return Response.json({ error: optionsError.message }, { status: 500 });
  if (!options || options.length === 0) {
    return Response.json({ error: 'Question not found.' }, { status: 404 });
  }

  const selected = options.find((option) => option.answer_id === selectedOptionId);
  if (!selected) {
    return Response.json({ error: 'Selected option does not belong to this question.' }, { status: 404 });
  }

  // Graded here, from the answer bank — the client never sends is_correct and is never
  // trusted for it.
  const correct = selected.is_correct;
  const correctOption = correct ? null : options.find((option) => option.is_correct);

  // A question without a correct option is a broken row in the bank, not a student error.
  if (!correct && !correctOption) {
    return Response.json({ error: 'Question has no correct option.' }, { status: 500 });
  }

  const { score, submitted_at: submittedAt } = log as AnsweredLogRow;

  return Response.json(
    {
      questionId,
      correct,
      score,
      submittedAt,
      selectedOption: {
        answerId: selected.answer_id,
        optionText: selected.option_text,
        explanation: selected.explanation,
      },
      // Only for a wrong pick: when the selection was correct its own explanation already is
      // the correct one, and repeating it says nothing new.
      correctOption: correctOption
        ? {
            answerId: correctOption.answer_id,
            optionText: correctOption.option_text,
            explanation: correctOption.explanation,
          }
        : null,
    },
    { status: 200 },
  );
}
