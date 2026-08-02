import { getSupabaseAdminClient, getSupabaseAuthClient, getSupabaseClient } from '../../../../lib/supabase';
import { passwordLengthError } from '../../../../lib/passwordRules';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

async function getAuthenticatedUser(token: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return { user: null, configError: true };

  const { data: { user }, error } = await supabase.auth.getUser(token);
  return { user: error ? null : user, configError: false };
}

/**
 * POST /api/profile/password — changes the signed-in student's password.
 *
 * There is no password column anywhere in our schema to check against, and there shouldn't
 * be: the old password is verified the same way login verifies any password — by asking
 * Supabase to sign the user in with it (REQ-independent, but the same principle as
 * app/api/auth/login/route.ts). Only once that succeeds does the change go through, via the
 * admin API — the same privilege tier app/api/auth/register/route.ts uses to create a user —
 * because our client only ever holds a bearer token, never a live Supabase session
 * (persistSession: false everywhere) that auth.updateUser() could act on directly.
 */
export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user || !user.email) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const body = await request.json();
  const { oldPassword, newPassword } = body as { oldPassword?: string; newPassword?: string };

  if (!oldPassword || !newPassword) {
    return Response.json({ error: 'oldPassword and newPassword are required.' }, { status: 400 });
  }

  const lengthError = passwordLengthError(newPassword);
  if (lengthError) return Response.json({ error: lengthError }, { status: 400 });

  const authClient = getSupabaseAuthClient();
  if (!authClient) {
    return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  }

  const { error: reauthError } = await authClient.auth.signInWithPassword({
    email: user.email,
    password: oldPassword,
  });

  if (reauthError) {
    return Response.json({ error: 'Current password is incorrect.' }, { status: 401 });
  }

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
    password: newPassword,
  });

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 400 });
  }

  return Response.json({ ok: true }, { status: 200 });
}
