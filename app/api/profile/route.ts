import { getSupabaseClient } from '../../../lib/supabase';

const PROFILE_COLUMNS = 'user_id, username, biography, avatar_url, role, first_name, last_name, age, semester';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

async function getAuthenticatedUser(token: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return { user: null, supabase: null, configError: true };

  const { data: { user }, error } = await supabase.auth.getUser(token);
  return { user: error ? null : user, supabase, configError: false };
}

export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { data, error } = await supabase!
    .from('user')
    .select(PROFILE_COLUMNS)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ profile: data }, { status: 200 });
}

export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const body = await request.json();
  const { username, biography } = body as { username?: string; biography?: string };

  if (!username) return Response.json({ error: 'username is required.' }, { status: 400 });

  const { data, error } = await supabase!
    .from('user')
    .insert({ user_id: user.id, username, biography: biography ?? '' })
    .select(PROFILE_COLUMNS)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 400 });

  return Response.json({ profile: data }, { status: 201 });
}

const MIN_AGE = 1;
const MAX_AGE = 129;
const MIN_SEMESTER = 1;
const MAX_SEMESTER = 20;

export async function PATCH(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const body = await request.json();
  const { biography, first_name, last_name, age, semester } = body as {
    biography?: string;
    first_name?: string | null;
    last_name?: string | null;
    age?: number | null;
    semester?: number | null;
  };

  const updates: Record<string, unknown> = {};

  if (biography !== undefined) updates.biography = biography;
  if (first_name !== undefined) updates.first_name = first_name?.trim() || null;
  if (last_name !== undefined) updates.last_name = last_name?.trim() || null;

  if (age !== undefined) {
    if (age !== null && (!Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE)) {
      return Response.json({ error: `age must be a whole number between ${MIN_AGE} and ${MAX_AGE}.` }, { status: 400 });
    }
    updates.age = age;
  }

  if (semester !== undefined) {
    if (semester !== null && (!Number.isInteger(semester) || semester < MIN_SEMESTER || semester > MAX_SEMESTER)) {
      return Response.json(
        { error: `semester must be a whole number between ${MIN_SEMESTER} and ${MAX_SEMESTER}.` },
        { status: 400 }
      );
    }
    updates.semester = semester;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No fields to update.' }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from('user')
    .update(updates)
    .eq('user_id', user.id)
    .select(PROFILE_COLUMNS)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 400 });

  return Response.json({ profile: data }, { status: 200 });
}
