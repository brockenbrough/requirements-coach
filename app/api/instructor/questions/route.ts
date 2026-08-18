import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import { createQuestionWithAnswers, validateQuestionInput, type QuestionInputBody } from '../../../../lib/questionAuthoringQueries';
import { assertCatalogIsEditable } from '../../../../lib/activityTypeQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/instructor/questions — adds a new question with its answers to the question bank
 * (GitHub #121).
 *
 * Body: { questionPrompt, activityType, difficultyLevel, answers: AnswerInput[] }
 * - answers must have at least 2 items, exactly one with isCorrect: true
 * - order_number is auto-assigned as MAX(order_number) + 1 for the activity type
 * - user_id is taken from the authenticated instructor, not from the request body
 * - activityType must not be a built-in example catalog (creator_id IS NULL) — 403s otherwise
 *   (GitHub #478, assertCatalogIsEditable in lib/activityTypeQueries.ts)
 *
 * Returns 201 with { questionId, answerIds }.
 *
 * Validation and the insert-with-rollback sequence live in lib/questionAuthoringQueries.ts,
 * shared with GitHub #380's create-and-hand-pick route.
 */
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const token = getToken(request);
  const guard = await requireInstructor(supabase, token);
  if (!guard.ok) {
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json(
          { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
          { status: guard.status },
        );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const validation = await validateQuestionInput(supabase, (body ?? {}) as QuestionInputBody);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: validation.status });

  // GitHub #478: a built-in example catalog is strictly read-only — no new question may be filed
  // under it, even by an instructor who owns none of its existing questions.
  const editable = await assertCatalogIsEditable(supabase, validation.data.activityType);
  if (!editable.ok) return editable.response;

  // Resolve the instructor's user_id from the token so the question is attributed to them.
  const { data: { user }, error: authError } = await supabase.auth.getUser(token!);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const result = await createQuestionWithAnswers(supabase, validation.data, user.id);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  return Response.json({ questionId: result.questionId, answerIds: result.answerIds }, { status: 201 });
}
