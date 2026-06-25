import { getSupabaseClient } from '../../../../lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return Response.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return Response.json({ error: error.message }, { status: 401 });
    }

    return Response.json({ session: data }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return Response.json({ error: message }, { status: 500 });
  }
}
