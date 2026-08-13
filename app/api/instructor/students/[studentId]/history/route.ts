import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import { isActivityType } from '../../../../../../lib/activityTypes';

// Same shape as app/api/students/[studentId]/history/route.ts's HISTORY_COLUMNS — the AC for
// this endpoint lists the exact same fields.
const HISTORY_COLUMNS = 'activity_type, difficulty_level, cumulative_score, max_score, passed, ended_at';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/students/:studentId/history?activityType=… — one student's completed
 * activity history, for an instructor (REQ-PL-3.2, GitHub #28).
 *
 * The instructor counterpart to GET /api/students/{id}/history: same columns and ordering, but
 * for an arbitrary student instead of the caller themselves — gated by requireInstructor rather
 * than a studentId === caller check. getSupabaseClient() is the service-role client and bypasses
 * RLS entirely, so that guard, not the database, is what stops one student from reading
 * another's history.
 *
 * Unlike the self-service route, an unknown studentId is a real possibility here (the caller did
 * not just authenticate as it), so it gets its own 404 rather than looking like an empty history
 * — checked against "user" with role = 'student', the same definition of "a student" that
 * loadAllStudentActivity's STUDENT_EMBED uses to keep instructor accounts out of class-wide
 * reports.
 */
export async function GET(request: Request, { params }: { params: { studentId: string } }) {
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

  const activityType = new URL(request.url).searchParams.get('activityType');
  if (activityType !== null) {
    const { valid: validActivityType, error: activityTypeError } = await isActivityType(supabase, activityType);
    if (activityTypeError) return Response.json({ error: activityTypeError.message }, { status: 500 });
    if (!validActivityType) {
      return Response.json({ error: 'Unknown activity type.' }, { status: 400 });
    }
  }

  const { data: student, error: studentError } = await supabase
    .from('user')
    .select('user_id')
    .eq('user_id', params.studentId)
    .eq('role', 'student')
    .maybeSingle();

  if (studentError) return Response.json({ error: studentError.message }, { status: 500 });
  if (!student) return Response.json({ error: 'Student not found.' }, { status: 404 });

  let query = supabase
    .from('session_log')
    .select(HISTORY_COLUMNS)
    .eq('user_id', params.studentId)
    .eq('status', 'completed');

  if (activityType !== null) query = query.eq('activity_type', activityType);

  const { data, error } = await query.order('ended_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ sessions: data ?? [] }, { status: 200 });
}
