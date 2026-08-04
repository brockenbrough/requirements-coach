import { getSupabaseClient } from '../../../lib/supabase';

const PROFILE_COLUMNS = 'user_id, username, biography, avatar_url, role, first_name, last_name, age, semester';

const MIN_AGE = 1;
const MAX_AGE = 129;
const MIN_SEMESTER = 1;
const MAX_SEMESTER = 20;

/** Returns an error message when `value` is set but outside [min, max]; null (unset) is always allowed. */
function rangeError(value: number | null | undefined, min: number, max: number, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < min || value > max) {
    return `${field} must be a whole number between ${min} and ${max}.`;
  }
  return null;
}

/**
 * The "user" row is created here, not at registration — role has to wait until now too. It
 * travels from app/api/auth/register/route.ts as auth user_metadata (checked against
 * INSTRUCTOR_SIGNUP_CODE there, server-side only) and is read back off the authenticated user
 * rather than trusted from the request body, so a profile POST can never self-promote.
 */
function deriveRole(user: { user_metadata?: { role?: unknown } }): 'student' | 'instructor' {
  return user.user_metadata?.role === 'instructor' ? 'instructor' : 'student';
}

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
  const { username, biography, first_name, last_name, age, semester } = body as {
    username?: string;
    biography?: string;
    first_name?: string;
    last_name?: string;
    age?: number | null;
    semester?: number | null;
  };

  if (!username) return Response.json({ error: 'username is required.' }, { status: 400 });
  if (!first_name?.trim()) return Response.json({ error: 'first_name is required.' }, { status: 400 });
  if (!last_name?.trim()) return Response.json({ error: 'last_name is required.' }, { status: 400 });

  const ageError = rangeError(age, MIN_AGE, MAX_AGE, 'age');
  if (ageError) return Response.json({ error: ageError }, { status: 400 });
  const semesterError = rangeError(semester, MIN_SEMESTER, MAX_SEMESTER, 'semester');
  if (semesterError) return Response.json({ error: semesterError }, { status: 400 });

  const { data, error } = await supabase!
    .from('user')
    .insert({
      user_id: user.id,
      username,
      biography: biography ?? '',
      role: deriveRole(user),
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      age: age ?? null,
      semester: semester ?? null,
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 400 });

  return Response.json({ profile: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const body = await request.json();
  const { biography, first_name, last_name, age, semester } = body as {
    biography?: string;
    first_name?: string;
    last_name?: string;
    age?: number | null;
    semester?: number | null;
  };

  const updates: Record<string, unknown> = {};

  if (biography !== undefined) updates.biography = biography;
  if (first_name !== undefined) {
    if (!first_name.trim()) return Response.json({ error: 'first_name cannot be empty.' }, { status: 400 });
    updates.first_name = first_name.trim();
  }
  if (last_name !== undefined) {
    if (!last_name.trim()) return Response.json({ error: 'last_name cannot be empty.' }, { status: 400 });
    updates.last_name = last_name.trim();
  }

  if (age !== undefined) {
    const ageError = rangeError(age, MIN_AGE, MAX_AGE, 'age');
    if (ageError) return Response.json({ error: ageError }, { status: 400 });
    updates.age = age;
  }

  if (semester !== undefined) {
    const semesterError = rangeError(semester, MIN_SEMESTER, MAX_SEMESTER, 'semester');
    if (semesterError) return Response.json({ error: semesterError }, { status: 400 });
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
