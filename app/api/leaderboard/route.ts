import { getSupabaseClient } from '../../../lib/supabase';
import { computeGlobalLeaderboard } from '../../../lib/leaderboardQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/leaderboard — the global leaderboard: every student account in the app, ranked by
 * total score across every course they're in. See computeGlobalLeaderboard's own doc
 * (lib/leaderboardQueries.ts) for why this is a deliberate exception to the shared-course
 * disclosure boundary GET /api/courses/{courseId}/leaderboard and
 * GET /api/students/{id}/public-profile otherwise enforce — a specific course's own leaderboard
 * is still the shared-roster-only view; this route is the intentionally different one.
 *
 * Any authenticated user gets the same ranking back — the roster doesn't depend on the caller at
 * all, only a valid token is required to call this at all, same as every other protected route.
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

  const { data, error } = await computeGlobalLeaderboard(supabase);
  if (error || !data) {
    return Response.json({ error: error?.message ?? 'Could not load leaderboard.' }, { status: 500 });
  }

  return Response.json({ entries: data }, { status: 200 });
}
