import { getSupabaseClient } from '../../../../../lib/supabase';
import { computeStudentStreak } from '../../../../../lib/streakQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/students/{studentId}/streak — the student's current daily streak (REQ-GAM-BL-2,
 * GitHub #307): the number of consecutive calendar days (UTC) with at least one completed,
 * passed session_log row, allowing up to a 36h gap between two chronologically consecutive
 * passed activities before the streak breaks. V1 scope is Type-A activities only — see
 * lib/streakQueries.ts.
 *
 * studentId must match the authenticated user — there is no instructor exception on this route,
 * the same rule every other /api/students/{studentId}/* route follows.
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

  const { currentStreak, error } = await computeStudentStreak(supabase, user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ currentStreak }, { status: 200 });
}
