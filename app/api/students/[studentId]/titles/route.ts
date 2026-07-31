import { getSupabaseClient } from '../../../../../lib/supabase';
import { computeStudentTitles } from '../../../../../lib/titleQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/students/{studentId}/titles — the student's current mastery title per activity type
 * (REQ-GAM-BL-1, REQ-GAM-DL-3, REQ-GAM-PL-2.1).
 *
 * One entry per activity type the student has attempted, each with the highest difficulty level
 * passed and the title looked up from title_definition; an activity type with no passed session
 * gets "Not yet started" instead of a title. A student with no session history at all gets [].
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

  const { titles, error } = await computeStudentTitles(supabase, user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ titles }, { status: 200 });
}
