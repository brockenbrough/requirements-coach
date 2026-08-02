import { getSupabaseAuthClient } from '../../../../lib/supabase';

/**
 * Exchanges a refresh token for a new access token, mirroring the login route's
 * { session: <supabase data> } shape so lib/authClient.ts can parse both the same way.
 * Runs on the anon-key client, same as login — refreshing a session is not a
 * privileged operation and must not require the service role key.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { refresh_token } = body as { refresh_token?: string };

    if (!refresh_token) {
      return Response.json({ error: 'refresh_token is required.' }, { status: 400 });
    }

    const supabase = getSupabaseAuthClient();

    if (!supabase) {
      return Response.json(
        { error: 'Supabase credentials are not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.local.' },
        { status: 500 },
      );
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });

    if (error || !data?.session) {
      return Response.json({ error: error?.message || 'Session could not be refreshed.' }, { status: 401 });
    }

    return Response.json({ session: data }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return Response.json({ error: message }, { status: 500 });
  }
}
