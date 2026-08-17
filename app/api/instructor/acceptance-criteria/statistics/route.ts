import { getSupabaseClient } from '../../../../../lib/supabase';
import { requireInstructor } from '../../../../../lib/instructorAuth';
import { computeAcceptanceCriteriaStatistics } from '../../../../../lib/acceptanceCriteriaStatisticsQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/acceptance-criteria/statistics — aggregates for the llm-graded activity
 * types this instructor created (GitHub #152). See computeAcceptanceCriteriaStatistics
 * (lib/acceptanceCriteriaStatisticsQueries.ts) for exactly what "created" scopes to.
 *
 * An empty submission table, or an instructor who owns no llm-graded catalog, still returns 200
 * with zeroed stats — no submissions yet is a normal state, not an error. No per-student data is
 * returned; use the per-student route for individual review.
 */
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json(
          { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
          { status: guard.status },
        );
  }

  const { statistics, error } = await computeAcceptanceCriteriaStatistics(supabase, guard.user_id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ statistics }, { status: 200 });
}
