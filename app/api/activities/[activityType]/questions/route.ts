import { getSupabaseClient } from '../../../../../lib/supabase';
import { isActivityType } from '../../../../../lib/activityTypes';

// REQ-DL-1.1: valid difficulty levels are 1 (easy), 2 (medium), 3 (hard).
const VALID_DIFFICULTY_LEVELS = [1, 2, 3];

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/activities/:activityType/questions?difficulty=1
 *
 * Returns all questions for the given activity type and difficulty level so
 * that the session-start logic can draw 4 at random.
 *
 * AC summary:
 *  - 401 if the bearer token is missing or invalid (GitHub #170: this route was previously
 *    reachable with no credentials at all, on the service-role client)
 *  - 400 if activityType is not a known value
 *  - 400 if difficulty is not 1, 2, or 3
 *  - 200 with an empty array if no questions exist for the combination
 *  - 200 with the matching questions (id, prompt, difficulty_level, max_score)
 */
export async function GET(
  request: Request,
  { params }: { params: { activityType: string } },
) {
  const { activityType } = params;

  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) {
    return Response.json(
      { error: 'Supabase credentials are not configured.' },
      { status: 500 },
    );
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  if (!isActivityType(activityType)) {
    return Response.json({ error: 'Unknown activity type.' }, { status: 400 });
  }

  const difficulty = Number(new URL(request.url).searchParams.get('difficulty'));

  if (!VALID_DIFFICULTY_LEVELS.includes(difficulty)) {
    return Response.json(
      { error: 'Difficulty level must be 1, 2, or 3.' },
      { status: 400 },
    );
  }

  // GitHub #124: the activity type filter now goes through an inner join against the
  // activity_type table added in #122/#123, instead of a plain equality check on the free-text
  // column. `activity` is only there to drive the join — stripped below so the response shape
  // (id, prompt, difficulty_level, max_score) stays unchanged.
  const { data: questions, error } = await supabase
    .from('question')
    .select('question_id, question_prompt, difficulty_level, max_score, activity:activity_type!inner ( activity_type )')
    .eq('activity.activity_type', activityType)
    .eq('difficulty_level', difficulty);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const cleaned = ((questions ?? []) as Record<string, unknown>[]).map(({ activity, ...rest }) => rest);

  return Response.json({ questions: cleaned }, { status: 200 });
}
