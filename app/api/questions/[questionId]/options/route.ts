import { getSupabaseClient } from '../../../../../lib/supabase';

/**
 * GET /api/questions/:questionId/options
 *
 * Returns all answer options for a question so the UI can display them for
 * selection. Deliberately omits is_correct and explanation — those are only
 * revealed after the student submits via POST .../answers + POST .../feedback.
 *
 * AC summary:
 *  - 404 if the question does not exist
 *  - 200 with all options (answer_id, option_text) — no is_correct, no explanation
 *
 * Note: the answer table has no score column yet (known gap in schema.sql).
 * Score will be included here once that column is added.
 */
export async function GET(
  _request: Request,
  { params }: { params: { questionId: string } },
) {
  const { questionId } = params;

  const supabase = getSupabaseClient();
  if (!supabase) {
    return Response.json(
      { error: 'Supabase credentials are not configured.' },
      { status: 500 },
    );
  }

  // Check the question exists before fetching its options.
  const { data: question, error: questionError } = await supabase
    .from('question')
    .select('question_id')
    .eq('question_id', questionId)
    .maybeSingle();

  if (questionError) return Response.json({ error: questionError.message }, { status: 500 });
  if (!question) return Response.json({ error: 'Question not found.' }, { status: 404 });

  // Join through question_to_answer to get the answer options.
  // is_correct and explanation are intentionally excluded — REQ-DL-2 says those
  // are only shown after the student has submitted an answer (feedback route).
  const { data, error } = await supabase
    .from('question_to_answer')
    .select('answer:answer_id ( answer_id, option_text )')
    .eq('question_id', questionId);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const options = ((data ?? []) as unknown as { answer: { answer_id: string; option_text: string } | null }[])
    .map((row) => row.answer)
    .filter((answer): answer is { answer_id: string; option_text: string } => answer !== null);

  return Response.json({ options }, { status: 200 });
}
