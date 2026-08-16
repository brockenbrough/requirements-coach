import { getSupabaseClient } from '../../../../../lib/supabase';
import { requireInstructor } from '../../../../../lib/instructorAuth';
import { computeLlmActivityStatistics } from '../../../../../lib/llmActivityStatisticsQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/acceptance-criteria/statistics — class-wide aggregates for LLM-graded
 * activities (GitHub #152).
 *
 * GitHub #379: an optional ?activityType= scopes the numbers to one catalog. Omitting it keeps
 * the pre-#379 behavior exactly — every llm-graded submission in the system, pooled — so the
 * instructor dashboard's existing figures do not shift on deploy. The route path still says
 * "acceptance-criteria" because renaming a live route is a separate change; the query behind it
 * is not activity-specific any more.
 *
 * An empty submission table still returns 200 with zeroed stats — no submissions yet is a
 * normal state, not an error. No per-student data is returned; use the per-student route for
 * individual review.
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

  const activityType = new URL(request.url).searchParams.get('activityType') ?? undefined;

  const { statistics, error } = await computeLlmActivityStatistics(supabase, activityType);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ statistics }, { status: 200 });
}
