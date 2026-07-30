import { createClient } from '@supabase/supabase-js';

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}

function createSupabase(url: string, key: string) {
  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
}

/**
 * Default client: service role key when available, anon key otherwise.
 * The routes that read RLS-protected tables (profile, sessions, answers)
 * rely on the service role key to bypass RLS.
 */
export function getSupabaseClient() {
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createSupabase(supabaseUrl, supabaseKey);
}

/**
 * Anon-key client for signing users in. Sign-in has to run with the anon key
 * so Supabase issues a session for that user instead of treating the request
 * as an already-privileged one. Falls back to the service role key so a
 * project configured with only that key still works.
 */
export function getSupabaseAuthClient() {
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createSupabase(supabaseUrl, supabaseKey);
}

/**
 * Service-role client. Required by the admin API (auth.admin.createUser) —
 * there is deliberately no anon fallback, so a missing service role key
 * surfaces as a configuration error instead of a confusing 401 from Supabase.
 */
export function getSupabaseAdminClient() {
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createSupabase(supabaseUrl, supabaseKey);
}
