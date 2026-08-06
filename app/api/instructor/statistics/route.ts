import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import { computeQuizStatistics } from '../../../../lib/quizStatisticsQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/statistics — class average and pass rate for each quiz, for an
 * instructor (GitHub #114).
 *
 * "Each quiz of a professor" is, today, every row in the activity_type table (#122) — there is
 * no professor-to-quiz ownership anywhere in the schema, the same gap already flagged for
 * GitHub #115's "students of the current prof". Every instructor account sees the same
 * statistics, class-wide.
 */
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    // 403 answers with no body at all (GitHub #169's acceptance criteria); 401 and 500 keep
    // the { error } shape every other route uses.
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json(
          { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
          { status: guard.status },
        );
  }

  const { statistics, error } = await computeQuizStatistics(supabase);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // AC: 404 when there are no quizzes at all — not to be confused with a quiz that simply has
  // no completed attempts yet, which still gets an entry (at 0%/0%).
  if (!statistics || statistics.length === 0) {
    return Response.json({ error: 'No quizzes found for this professor.' }, { status: 404 });
  }

  return Response.json({ statistics }, { status: 200 });
}
