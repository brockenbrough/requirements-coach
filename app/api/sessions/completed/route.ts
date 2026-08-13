import { getSupabaseClient } from '../../../../lib/supabase';
import { isActivityType } from '../../../../lib/activityTypes';
import { loadCompletedAttempts } from '../../../../lib/sessionQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/sessions/completed?activityType=… — the student's finished attempts at one activity.
 *
 * This is the list behind "the highest score the student has achieved in this activity, along
 * with a list of prior results for the activity" on an activity's opening page
 * (docs/requirements/requirements.md), i.e. the attempt records of REQ-PL-2.8.
 *
 * Each entry carries only what a history row shows: score out of max, difficulty level, whether
 * it was passed, and when it ended. Questions and answers are not included — reviewing a past
 * attempt question by question is a different feature with a different endpoint.
 *
 * activityType is required. Without it the answer would be the cross-activity history that
 * GET /api/sessions?status=completed already returns.
 *
 * An empty list is a 200, not a 404: unlike /api/sessions/in-progress, which asks after one
 * specific running record, a history legitimately starts out empty. "Never played this yet" is
 * a normal state for a student, not a missing resource.
 */
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const activityType = new URL(request.url).searchParams.get('activityType');
  // Narrows activityType to string for the rest of the function — isActivityType's async check
  // below can no longer double as a type predicate the way the old synchronous version did.
  if (activityType === null) return Response.json({ error: 'Unknown activity type.' }, { status: 400 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { valid: validActivityType, error: activityTypeError } = await isActivityType(supabase, activityType);
  if (activityTypeError) return Response.json({ error: activityTypeError.message }, { status: 500 });
  if (!validActivityType) {
    return Response.json({ error: 'Unknown activity type.' }, { status: 400 });
  }

  // The student id comes from the auth session, never from the query string — that is the whole
  // of "a student only ever sees their own history".
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { attempts, error } = await loadCompletedAttempts(supabase, user.id, activityType);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ attempts }, { status: 200 });
}
