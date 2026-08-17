import { getSupabaseClient } from '../../../../../lib/supabase';
import { requireInstructor } from '../../../../../lib/instructorAuth';
import { computeLlmActivityStatistics } from '../../../../../lib/llmActivityStatisticsQueries';
import { listOwnedActivityTypes } from '../../../../../lib/activityTypeQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/acceptance-criteria/statistics — aggregates for the llm-graded activity
 * types this instructor created (GitHub #152). The route path still says "acceptance-criteria"
 * because renaming a live route is a separate change; the query behind it is not
 * activity-specific any more (GitHub #379).
 *
 * Two scopes, not one: an explicit ?activityType= scopes to that one catalog (GitHub #379's
 * original single-catalog use case, for whatever screen wants exactly one catalog's own figures).
 * Omitting it does NOT fall back to computeLlmActivityStatistics' own unscoped/pooled default —
 * this route always resolves "this instructor's own owned llm-graded types"
 * (listOwnedActivityTypes(..., 'llm-graded'), lib/activityTypeQueries.ts) and passes that list
 * instead, so a fresh instructor with no llm-graded catalog gets zeroed stats rather than every
 * other instructor's pooled numbers. See computeLlmActivityStatistics's own docstring for exactly
 * what "created" scopes to.
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

  const requestedActivityType = new URL(request.url).searchParams.get('activityType');

  let activityType: string | string[];
  if (requestedActivityType) {
    activityType = requestedActivityType;
  } else {
    const { activityTypes: ownedTypes, error: ownedError } = await listOwnedActivityTypes(
      supabase,
      guard.user_id,
      'llm-graded',
    );
    if (ownedError || !ownedTypes) {
      return Response.json({ error: ownedError?.message ?? 'Could not load your catalogs.' }, { status: 500 });
    }
    activityType = ownedTypes;
  }

  const { statistics, error } = await computeLlmActivityStatistics(supabase, activityType);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ statistics }, { status: 200 });
}
