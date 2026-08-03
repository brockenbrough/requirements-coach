import { getSupabaseAdminClient } from "../../../../lib/supabase";

// GitHub #82: hardcoded rather than an environment variable (team decision — no env changes
// for this feature). Still compared only ever on the server below, so it's exactly as
// invisible to the browser as an env var would have been; the trade-off is that rotating it
// now needs a code change + deploy instead of an env var edit.
// CHANGE THIS before relying on it for real access control.
const INSTRUCTOR_SIGNUP_CODE = "CHANGE-ME-instructor-2026";

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
    // correct code grants 'instructor', anything else (wrong code, no code) silently stays
    // 'student' — cannot be read or bypassed from client-side JavaScript. The role travels in
    // the auth user's metadata because the "user" profile row (where role actually lives, see
    // supabase/schema.sql) isn't created until the student fills in the profile form later;
    // app/api/profile/route.ts reads it back from there at that point.
    const role = instructorCode === INSTRUCTOR_SIGNUP_CODE ? "instructor" : "student";

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
