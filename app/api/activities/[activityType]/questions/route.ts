import { getSupabaseClient } from '../../../../../lib/supabase';
import { isActivityType } from '../../../../../lib/activityTypes';

// REQ-DL-1.1: valid difficulty levels are 1 (easy), 2 (medium), 3 (hard).
const VALID_DIFFICULTY_LEVELS = [1, 2, 3];

/**
 * GET /api/activities/:activityType/questions?difficulty=1
 *
 * Returns all questions for the given activity type and difficulty level so
 * that the session-start logic can draw 4 at random.
 *
 * AC summary:
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

  const supabase = getSupabaseClient();
  if (!supabase) {
    return Response.json(
      { error: 'Supabase credentials are not configured.' },
      { status: 500 },
    );
  }

  const { data: questions, error } = await supabase
    .from('question')
    .select('question_id, question_prompt, difficulty_level, max_score')
    .eq('activity_type', activityType)
    .eq('difficulty_level', difficulty);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ questions: questions ?? [] }, { status: 200 });
}
