import { getSupabaseClient } from "../../../../../../lib/supabase";
import { requireInstructor } from "../../../../../../lib/instructorAuth";
import { DEFAULT_QUESTION_MAX_SCORE } from "../../../../../../lib/sessionRules";

function getToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

type SourceAnswerRow = {
  answer_id: string;
  option_text: string;
  is_correct: boolean;
  explanation: string | null;
};

type SourceQuestionRow = {
  question_id: string;
  question_prompt: string;
  activity_type: string;
  difficulty_level: number;
  max_score: number | null;
  question_to_answer: { answer: SourceAnswerRow | null }[];
};

/**
 * POST /api/instructor/questions/{questionId}/copy — copies any question already in the bank
 * (another instructor's or the caller's own, found via GET .../questions?scope=all) into a
 * brand-new question row owned by the caller. This is the "copy-on-add" half of sharing the
 * question bank across instructors: the new row is a full, independent copy, not a link back to
 * the source — so editing it later (PATCH .../questions/{id}, which 403s a non-owner) can never
 * change the original author's question, and the original author editing theirs can never
 * change what the caller's course now uses.
 *
 * Deliberately does not check question.user_id against the caller before reading the source —
 * unlike PATCH, which 403s a non-owner, copying is the one operation on this table that is
 * meant to cross ownership boundaries. Copying your own question is allowed too (harmless
 * duplicate), since there's no reason to special-case it.
 *
 * Reuses POST /api/instructor/questions's own conventions: order_number is auto-assigned as
 * MAX(order_number) + 1 scoped to the (copied) activity_type, and a partial failure rolls the
 * insert back in the same child-before-parent order (question_to_answer, then answer, then
 * question).
 *
 * Returns 201 with { questionId, answerIds } — the id/ids of the new copy, not the source — the
 * same shape POST returns, so a caller can treat "copy" and "create" identically.
 */
export async function POST(
  request: Request,
  { params }: { params: { questionId: string } },
) {
  const supabase = getSupabaseClient();
  if (!supabase)
    return Response.json(
      { error: "Supabase credentials are not configured." },
      { status: 500 },
    );

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json(
          {
            error:
              guard.status === 401
                ? "Unauthorized"
                : "Supabase credentials are not configured.",
          },
          { status: guard.status },
        );
  }

  const { questionId } = params;

  const { data: source, error: sourceError } = await supabase
    .from("question")
    .select(
      "question_id, question_prompt, activity_type, difficulty_level, max_score, question_to_answer(answer:answer_id(answer_id, option_text, is_correct, explanation))",
    )
    .eq("question_id", questionId)
    .maybeSingle();

  if (sourceError)
    return Response.json({ error: sourceError.message }, { status: 500 });
  if (!source)
    return Response.json({ error: "Question not found." }, { status: 404 });

  const sourceRow = source as unknown as SourceQuestionRow;
  const sourceAnswers = sourceRow.question_to_answer
    .map((link) => link.answer)
    .filter((a): a is SourceAnswerRow => a !== null);

  // Auto-assign order_number as MAX + 1 for this activity type, same as POST /api/instructor/questions.
  const { data: maxRow, error: maxError } = await supabase
    .from("question")
    .select("order_number")
    .eq("activity_type", sourceRow.activity_type)
    .order("order_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxError)
    return Response.json({ error: maxError.message }, { status: 500 });

  const orderNumber = (maxRow?.order_number ?? 0) + 1;
  const copyId = crypto.randomUUID();

  const { error: questionError } = await supabase.from("question").insert({
    question_id: copyId,
    question_prompt: sourceRow.question_prompt,
    activity_type: sourceRow.activity_type,
    difficulty_level: sourceRow.difficulty_level,
    order_number: orderNumber,
    max_score: sourceRow.max_score ?? DEFAULT_QUESTION_MAX_SCORE,
    user_id: guard.user_id,
  });

  if (questionError)
    return Response.json({ error: questionError.message }, { status: 500 });

  // Same best-effort, child-before-parent rollback as POST /api/instructor/questions: an
  // orphaned copy with no (or partial) answers is unplayable and pollutes order_number
  // sequencing for its activity_type.
  async function rollbackAndFail(insertedAnswerIds: string[], message: string) {
    await supabase!
      .from("question_to_answer")
      .delete()
      .eq("question_id", copyId);
    if (insertedAnswerIds.length > 0) {
      await supabase!
        .from("answer")
        .delete()
        .in("answer_id", insertedAnswerIds);
    }
    await supabase!.from("question").delete().eq("question_id", copyId);
    return Response.json({ error: message }, { status: 500 });
  }

  const answerIds: string[] = [];

  for (const a of sourceAnswers) {
    const answerId = crypto.randomUUID();

    const { error: answerError } = await supabase.from("answer").insert({
      answer_id: answerId,
      option_text: a.option_text,
      is_correct: a.is_correct,
      explanation: a.explanation,
    });

    if (answerError) return rollbackAndFail(answerIds, answerError.message);

    answerIds.push(answerId);

    const { error: linkError } = await supabase
      .from("question_to_answer")
      .insert({
        question_id: copyId,
        answer_id: answerId,
      });

    if (linkError) return rollbackAndFail(answerIds, linkError.message);
  }

  return Response.json({ questionId: copyId, answerIds }, { status: 201 });
}
