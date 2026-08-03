import { getSupabaseClient } from "../../../../../lib/supabase";
import { loadActivityLog } from "../../../../../lib/sessionQueries";

function getToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

/**
 * GET /api/students/{studentId}/activities — the student's full activity log for the profile
 * page: every session ever started, across every activity type and status, newest first.
 *
 * Unlike GET /api/sessions (one status at a time, scoped only to the authenticated caller),
 * this is path-scoped like .../score and .../titles and merges in-progress, completed and
 * abandoned sessions onto one timeline instead of requiring three separate calls.
 *
 * studentId must match the authenticated user — there is no instructor exception on this route.
 */
export async function GET(
  request: Request,
  { params }: { params: { studentId: string } },
) {
  const token = getToken(request);
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase)
    return Response.json(
      { error: "Supabase credentials are not configured." },
      { status: 500 },
    );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user)
    return Response.json(
      { error: "Invalid or expired token." },
      { status: 401 },
    );

  if (params.studentId !== user.id) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const { activities, error } = await loadActivityLog(supabase, user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ activities }, { status: 200 });
}
