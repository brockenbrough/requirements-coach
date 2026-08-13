import { getSupabaseAdminClient } from "../../../../lib/supabase";

// GitHub #280: was a hardcoded literal here (GitHub #82's original "no env changes for this
// feature" decision) — a real access-control secret sitting in plaintext in version control,
// rotatable only by a code change + deploy. Read from the environment instead, exactly like
// every Supabase credential in lib/supabase.ts; see isConfiguredInstructorCode below for what
// happens when it's missing.
function isConfiguredInstructorCode(value: string | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  // Rejects the leaked default (and any other CHANGE-ME-style placeholder someone pastes in)
  // even if it's somehow set as the env var itself — a safety net behind the "don't hardcode
  // it" fix, not a replacement for it.
  return trimmed.length > 0 && !trimmed.toUpperCase().startsWith("CHANGE-ME");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, instructorCode } = body as {
      email?: string;
      password?: string;
      instructorCode?: string;
    };

    if (!email || !password) {
      return Response.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }

    // GitHub #82: the only check that matters, and it only ever runs here on the server —
    // correct code grants 'instructor', wrong code silently stays 'student' — cannot be read or
    // bypassed from client-side JavaScript. The role travels in the auth user's metadata
    // because the "user" profile row (where role actually lives, see supabase/schema.sql) isn't
    // created until the student fills in the profile form later; app/api/profile/route.ts reads
    // it back from there at that point.
    //
    // No instructorCode at all is the ordinary student signup path and must not be affected by
    // whether instructor signup happens to be configured — only an actual attempt to claim the
    // instructor role (a non-empty instructorCode) needs a configured secret to check it
    // against. GitHub #280: a missing/placeholder INSTRUCTOR_SIGNUP_CODE must never silently
    // fall back to granting (or to comparing against) a built-in default — that attempt is
    // rejected outright instead.
    let role: "student" | "instructor" = "student";

    if (instructorCode) {
      const configuredCode = process.env.INSTRUCTOR_SIGNUP_CODE;

      if (!isConfiguredInstructorCode(configuredCode)) {
        console.error(
          "INSTRUCTOR_SIGNUP_CODE not configured — rejecting instructor signup attempt.",
        );
        return Response.json(
          { error: "Registration is temporarily unavailable. Please try again later." },
          { status: 500 },
        );
      }

      role = instructorCode === configuredCode ? "instructor" : "student";
    }

    // Registration goes through the admin API, so the service role key is
    // mandatory here — the anon key cannot create users.
    const supabase = getSupabaseAdminClient();

    if (!supabase) {
      return Response.json(
        {
          error:
            "Supabase credentials are not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
        },
        { status: 500 },
      );
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role },
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json({ user: data?.user ?? null }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
