import type { SupabaseClient } from './sessionQueries';

export type RequireInstructorResult = { ok: true; user_id: string } | { ok: false; status: 401 | 403 | 500 };

/**
 * GitHub #169: the guard every instructor-only route must run before touching any data.
 *
 * These routes read via getSupabaseClient() (service role), which bypasses RLS entirely — the
 * own_sessions_select policy in supabase/schema.sql (line 258) protects a student reading their
 * own rows, but nothing in the database stops a request from asking for every student's. This
 * function is what actually protects a class-wide read: the route, not the database.
 *
 * Mirrors the auth preamble already duplicated across every route — getToken, then
 * supabase.auth.getUser(token), deriving the caller's identity from the *token*, never the
 * request body/query/path (see getAuthenticatedUser in app/api/profile/route.ts) — and adds
 * exactly one more step: look up that user's role in "user" and reject anything that isn't
 * 'instructor'. A missing "user" row is treated the same as role: 'student' — no profile row
 * means nothing has ever confirmed this account is an instructor (see the role-in-metadata
 * bridge in app/api/auth/register/route.ts, only resolved into a real row by POST /api/profile),
 * so it must not be trusted with class-wide data by default.
 *
 * Usage in a route (the 403 branch deliberately sends no body — see GitHub #169's acceptance
 * criteria — while 401/500 keep the { error } shape every other route already uses):
 *
 *   const supabase = getSupabaseClient();
 *   if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
 *
 *   const guard = await requireInstructor(supabase, getToken(request));
 *   if (!guard.ok) {
 *     return guard.status === 403
 *       ? new Response(null, { status: 403 })
 *       : Response.json({ error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' }, { status: guard.status });
 *   }
 *   // guard.user_id is now a confirmed instructor.
 */
export async function requireInstructor(supabase: SupabaseClient, token: string | null): Promise<RequireInstructorResult> {
  if (!token) return { ok: false, status: 401 };

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) return { ok: false, status: 401 };

  const { data: profile, error: profileError } = await supabase
    .from('user')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) return { ok: false, status: 500 };
  if (!profile || (profile as { role: string }).role !== 'instructor') return { ok: false, status: 403 };

  return { ok: true, user_id: user.id };
}
