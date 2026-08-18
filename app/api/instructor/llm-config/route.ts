import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import { isLLMProviderName } from '../../../../lib/llm/provider';
import { encryptSecret } from '../../../../lib/secretEncryption';

const UNIQUE_VIOLATION = '23505';

// api_key is deliberately excluded — write-only from the client's perspective, matching the
// schema comment on instructor_llm_config ("only a service-role route can read or write
// api_key, and that route is responsible for masking it before it reaches the client"). The
// column itself also never holds a plaintext key: POST encrypts it (lib/secretEncryption.ts)
// before the insert, so even a direct database read only ever sees ciphertext.
const CONFIG_COLUMNS = 'instructor_llm_config_id, provider, model, is_active, updated_at';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET/POST /api/instructor/llm-config — an instructor's LLM provider + model + API key used to
 * grade free-text submissions (instructor_llm_config).
 *
 * Instructor-only: requireInstructor runs before any row is touched, the same guard every other
 * /api/instructor/* route uses.
 *
 * uq_instructor_llm_config_one_active is a *global* partial unique index (supabase/schema.sql) —
 * at most one row across every instructor, not just this caller, can have is_active = true.
 * setActive: true therefore deactivates whichever row currently holds that flag before the new
 * row is inserted. supabase-js has no multi-statement transaction here, so the deactivate and
 * the insert aren't atomic — a concurrent activation can still land in between and trip the
 * unique index; on that 23505 the pair is retried once, the same bounded-retry idea POST
 * /api/sessions uses for uq_session_log_one_active.
 *
 * POST AC summary:
 *  - 401 if the bearer token is missing or invalid
 *  - 403 if the caller isn't an instructor (no body, matching requireInstructor's convention)
 *  - 400 if provider isn't one of CLAUDE/CHATGPT/GEMINI, or apiKey is empty
 *  - 200 with the saved row — api_key never included
 *  - 500 if Supabase isn't configured, LLM_CONFIG_ENCRYPTION_KEY isn't configured, or a query fails
 *
 * GET AC summary:
 *  - Same 401/403 as POST.
 *  - No ?provider=&model= given: 200 with the caller's own most recently saved row (POST
 *    always inserts, never updates in place, so a caller can have several rows over time —
 *    this is the same "most recent row for this user_id" precedent the grading route uses for
 *    the story's creator), or `{ config: null }` if they've never saved one — a normal state,
 *    not a 404.
 *  - ?provider=&model= given together: 200 with the most recent row for that *exact* pair, or
 *    `{ config: null }` if the caller has never saved one for it, even if a different pair is
 *    now their most recent save. 400 if provider isn't one of CLAUDE/CHATGPT/GEMINI, or only
 *    one of the two query params is given.
 *  - 500 if Supabase isn't configured or the query fails.
 */
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json(
          { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
          { status: guard.status },
        );
  }

  const { searchParams } = new URL(request.url);
  const providerParam = searchParams.get('provider');
  const modelParam = searchParams.get('model');
  const hasFilter = providerParam !== null || modelParam !== null;

  if (hasFilter) {
    if (!isLLMProviderName(providerParam)) {
      return Response.json({ error: 'provider must be one of CLAUDE, CHATGPT, GEMINI.' }, { status: 400 });
    }
    if (!modelParam || modelParam.trim() === '') {
      return Response.json({ error: 'model is required when filtering by provider.' }, { status: 400 });
    }
  }

  let query = supabase.from('instructor_llm_config').select(CONFIG_COLUMNS).eq('user_id', guard.user_id);
  if (hasFilter) {
    query = query.eq('provider', providerParam).eq('model', modelParam);
  }

  const { data: config, error } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ config: config ?? null }, { status: 200 });
}

export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json(
          { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
          { status: guard.status },
        );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { provider, apiKey, model, setActive } = (body ?? {}) as {
    provider?: unknown;
    apiKey?: unknown;
    model?: unknown;
    setActive?: unknown;
  };

  if (!isLLMProviderName(provider)) {
    return Response.json({ error: 'provider must be one of CLAUDE, CHATGPT, GEMINI.' }, { status: 400 });
  }

  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    return Response.json({ error: 'apiKey is required.' }, { status: 400 });
  }

  // Encrypted before it ever reaches the database — see lib/secretEncryption.ts. null means
  // LLM_CONFIG_ENCRYPTION_KEY isn't configured for this deployment; fail closed rather than
  // fall back to writing the plaintext key.
  const encryptedApiKey = encryptSecret(apiKey);
  if (!encryptedApiKey) {
    return Response.json({ error: 'LLM key storage is not configured.' }, { status: 500 });
  }

  const isActive = Boolean(setActive);

  const deactivateExisting = () =>
    supabase.from('instructor_llm_config').update({ is_active: false }).eq('is_active', true);

  const insertRow = () =>
    supabase
      .from('instructor_llm_config')
      .insert({
        instructor_llm_config_id: crypto.randomUUID(),
        user_id: guard.user_id,
        provider,
        model,
        api_key: encryptedApiKey,
        is_active: isActive,
      })
      .select(CONFIG_COLUMNS)
      .single();

  if (isActive) {
    const { error: deactivateError } = await deactivateExisting();
    if (deactivateError) return Response.json({ error: deactivateError.message }, { status: 500 });
  }

  let { data: config, error: insertError } = await insertRow();

  // Narrow race window between the deactivate above and this insert — retry the pair once
  // rather than failing a legitimate save.
  if (insertError?.code === UNIQUE_VIOLATION && isActive) {
    const { error: retryDeactivateError } = await deactivateExisting();
    if (retryDeactivateError) return Response.json({ error: retryDeactivateError.message }, { status: 500 });
    ({ data: config, error: insertError } = await insertRow());
  }

  if (insertError || !config) {
    return Response.json({ error: insertError?.message ?? 'Could not save LLM config.' }, { status: 500 });
  }

  return Response.json({ config }, { status: 200 });
}
