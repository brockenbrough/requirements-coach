import { getSupabaseClient } from '../../../lib/supabase';
import { computeGlobalLeaderboard } from '../../../lib/leaderboardQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/leaderboard — the dashboard's global leaderboard (GitHub #432 follow-up), the
 * counterpart to GET /api/courses/{courseId}/leaderboard that ranks by total score across every
 * course the caller shares with the ranked students, not one course's own points. See
 * computeGlobalLeaderboard (lib/leaderboardQueries.ts) for why "global" stops at "shares a course
 * with the caller" rather than every user in the app — the same enrollment-based disclosure
 * boundary GET /api/courses/{courseId}/leaderboard and GET /api/students/{id}/public-profile use.
 *
 * No courseId in this route at all — that absence is the point: the caller's own enrolled
 * courses (derived from their token, never a request param) decide the roster.
 *
 * A caller enrolled in nothing gets a normal 200 with an empty list, not a 403/404 — same
 * reasoning as computeCourseLeaderboard's "course exists but has nobody enrolled" case: there is
 * no error here, just nothing to rank yet.
 */
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { data, error } = await computeGlobalLeaderboard(supabase, user.id);
  if (error || !data) {
    return Response.json({ error: error?.message ?? 'Could not load leaderboard.' }, { status: 500 });
  }

  return Response.json({ entries: data }, { status: 200 });
}
