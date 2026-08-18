import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import { isGradingKind, slugifyQuizName, validateRatingPromptText } from '../../../../lib/activityTypes';

// Matches activity_type.activity_type varchar(50) in supabase/schema.sql.
const MAX_KEY_LENGTH = 50;

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/activities/types — creates a named question catalog (GitHub #347), i.e. a new row in
 * the activity_type lookup table every question/session_log/title_definition already keys on.
 *
 * A catalog belongs only to its creator (creator_id) — it has no course of its own. There used to
 * be a required courseId here (activity_type_course, a direct catalog-to-course link); that table
 * is gone. A catalog becomes visible to students only once an instructor composes an
 * assembled_quiz (GitHub #360, POST /api/instructor/assembled-quizzes) for a course that
 * references it — see lib/activityCourseQueries.ts's checkActivityAccess for the derived access
 * check this now backs.
 *
 * Body: { name: string, gradingKind: 'mcq' | 'llm-graded', description?: string, ratingPrompt?: string }.
 *
 * GitHub #379: gradingKind decides which pool the new activity draws from — question/answer rows
 * for 'mcq', free-text user_story prompts graded by the instructor's configured LLM provider for
 * 'llm-graded'. It is required with no default even though the column has one: enforcing the
 * choice only in the create modal would let the route quietly fall back to 'mcq' for any other
 * caller, and the kind is not editable afterwards, so a silent default is a wrong catalog rather
 * than a fixable one.
 *
 * GitHub #379 follow-up: ratingPrompt is required, validated via validateRatingPromptText, when
 * (and only when) gradingKind is 'llm-graded' — an instructor must set the catalog's own grading
 * rubric up front, since every submission against this catalog will be graded with it. A stray
 * ratingPrompt on an 'mcq' catalog is silently ignored rather than rejected, matching how other
 * kind-specific fields in this app are handled.
 *
 * The stored key (activity_type) is *derived* from name via slugifyQuizName — upper-cased,
 * non-alphanumeric runs collapsed to one underscore, the same format the three built-in keys
 * already have — never client-supplied directly, so an instructor names their catalog the same
 * way they'd name anything else in the app.
 *
 * The key must be unique. A collision is reported as 409, not silently resolved with a suffix —
 * the instructor picks a different name themselves, same as a duplicate username or course code
 * anywhere else in the app.
 *
 * creator_id comes from the authenticated instructor (guard.user_id), never the request body.
 *
 * Returns: { quiz: { activityType, name, description, gradingKind, ratingPrompt } }
 */
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json({ error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' }, { status: guard.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { name, description, gradingKind, ratingPrompt } = (body ?? {}) as {
    name?: unknown;
    description?: unknown;
    gradingKind?: unknown;
    ratingPrompt?: unknown;
  };

  if (typeof name !== 'string' || name.trim() === '') {
    return Response.json({ error: 'name is required.' }, { status: 400 });
  }

  if (!isGradingKind(gradingKind)) {
    return Response.json({ error: 'gradingKind must be "mcq" or "llm-graded".' }, { status: 400 });
  }

  if (description !== undefined && description !== null && typeof description !== 'string') {
    return Response.json({ error: 'description must be a string.' }, { status: 400 });
  }

  let trimmedRatingPrompt: string | null = null;
  if (gradingKind === 'llm-graded') {
    const validation = validateRatingPromptText(ratingPrompt);
    if (!validation.ok) return validation.response;
    trimmedRatingPrompt = validation.ratingPrompt;
  }

  const key = slugifyQuizName(name);

  if (key === '') {
    return Response.json({ error: 'name must contain at least one letter or number.' }, { status: 400 });
  }
  if (key.length > MAX_KEY_LENGTH) {
    return Response.json(
      { error: `name is too long — the derived key must be ${MAX_KEY_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }

  const trimmedDescription = typeof description === 'string' && description.trim() !== '' ? description.trim() : null;

  const { data, error } = await supabase
    .from('activity_type')
    .insert({
      activity_type: key,
      quiz_name: name.trim(),
      description: trimmedDescription,
      grading_kind: gradingKind,
      rating_prompt: trimmedRatingPrompt,
      creator_id: guard.user_id,
    })
    .select('activity_type, quiz_name, description, grading_kind, rating_prompt')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: 'A quiz with this name already exists. Choose a different name.' }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  const row = data as {
    activity_type: string;
    quiz_name: string;
    description: string | null;
    grading_kind: string;
    rating_prompt: string | null;
  };

  return Response.json(
    {
      quiz: {
        activityType: row.activity_type,
        name: row.quiz_name,
        description: row.description,
        gradingKind: row.grading_kind,
        ratingPrompt: row.rating_prompt,
      },
    },
    { status: 201 },
  );
}
