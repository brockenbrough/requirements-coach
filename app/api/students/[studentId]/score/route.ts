import { getSupabaseClient } from '../../../../../lib/supabase';
import { computeStudentScore } from '../../../../../lib/scoreQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/students/{studentId}/score — the student's cumulative score across all activity
 * types and difficulty levels (REQ-GAM-DL-1, REQ-GAM-PL-1).
 *
 * The sum of the best passing score at each (activity_type, difficulty_level) pair — retaking a
 * level and scoring higher raises the total, and only passed sessions ever contribute. A
 * student with no passing sessions gets 0.
 *
 * studentId must match the authenticated user — there is no instructor exception on this route.
 */
export async function GET(request: Request, { params }: { params: { studentId: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  if (params.studentId !== user.id) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const { score, error } = await computeStudentScore(supabase, user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ score }, { status: 200 });
}
