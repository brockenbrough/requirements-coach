# Administrator Manual

This is for whoever administers a live deployment of Training Ground — usually the professor
running the course, sometimes a TA or IT person helping them. It covers the things that are **not
obvious from using the app itself**: values that live in environment variables, one-time setup
steps, and "what do I do when a professor asks me X" situations.

If you're setting up a brand-new deployment from scratch, start with the root [README.md](../../README.md)
— it walks through creating the Supabase project, running the schema, and getting the app running.
This manual assumes that's already done and focuses on ongoing administration.

## There is no "admin" role in the app

The `"user"` table only supports two roles: `student` and `instructor` (see the `ck_user_role`
check constraint in `supabase/schema.sql`). There is no third "admin"/"superadmin" role, and no
admin screen inside the app itself. Anything an "administrator" needs to do — rotating secrets,
running SQL, managing Storage buckets — happens outside the app, directly against the hosting
platform (e.g. Vercel) and the Supabase project. That's what this manual is about.

An instructor account is just a regular account that was granted the `instructor` role at
sign-up time (see the next section) — there's no way to promote a `student` account to
`instructor` after the fact through the UI. If that's needed, it has to be done directly in the
Supabase dashboard: `update "user" set role = 'instructor' where user_id = '<uuid>';`.

## "What's the Instructor Access Code?"

When a professor registers a new account, the sign-up form asks for an **Instructor Access
Code**. Entering the correct code is what grants that account the `instructor` role instead of
`student` (see `app/api/auth/register/route.ts`).

This code is **not** stored in the database and is **not** something you can look up in the app.
It's the value of the `INSTRUCTOR_SIGNUP_CODE` environment variable on whichever server is
running the app (e.g. a Vercel project's Environment Variables settings). Each deployment
(production, staging, a developer's local `.env.local`) can — and should — have its own value.

**If a professor asks you for the code:** you have to go look it up (or set it) in the
deployment's environment variables yourself. There's no in-app way to retrieve it, and the app
deliberately never emails or displays it anywhere.

**If the code isn't working / signup fails with a server error:** check that
`INSTRUCTOR_SIGNUP_CODE` is actually set, and that it doesn't still have the placeholder value
starting with `CHANGE-ME`. An unset or placeholder value makes instructor sign-up fail closed
(500 error) rather than silently letting anyone in — that's intentional, not a bug.

**Rotating the code:** just change the environment variable and redeploy. It only affects future
sign-ups; it has no effect on instructors who already registered.

## "A professor forgot their course's join code"

Every course an instructor creates gets a unique, randomly generated join code (`course_code`)
that students use to enroll themselves. This code is generated once, at course creation, and
**cannot be regenerated or changed** — there's no "reset code" button anywhere, and no API route
for it.

The good news: it's never actually lost. It's always visible to the instructor on the course's
own page — **Instructor → Courses → (click the course)**. The code is shown at the top of that
page next to a copy-to-clipboard button. So "forgot the join code" really means "doesn't know
where to look" — point them at their course's detail page.

If a course was created without a self-serve join code (an instructor can enroll students
directly by adding them one-by-one instead), there is no code to give out — that course is
enrollment-by-instructor only, by design.

## Setting up LLM grading (for "Write Acceptance Criteria"-style activities)

Some activity catalogs are graded by an LLM instead of multiple-choice. For these to work, an
instructor has to configure an LLM provider under **Instructor → Settings**. The provider/model
choice is not an environment variable — it's entered through that in-app form and stored (masked
in every API response) in the `instructor_llm_config` table. The API key itself *is* backed by an
environment variable, though: `LLM_CONFIG_ENCRYPTION_KEY` (see `.env.example`) is the secret the
app encrypts that key with before writing it to the database, so it's never stored in plaintext —
this variable must be set (a base64-encoded 32-byte value, `openssl rand -base64 32`) for saving
or grading against an LLM config to work at all; if it's missing, saving a config or grading a
submission fails with a 500 rather than silently falling back to plaintext.

**If you're deploying this on top of an existing database** that already has rows in
`instructor_llm_config` from before `LLM_CONFIG_ENCRYPTION_KEY` existed: those rows were saved as
plaintext and cannot be decrypted after this change ships. Any instructor who already configured
a provider needs to re-save it once from **Instructor → Settings** — grading will 500 with
"Configured LLM provider key could not be read" until they do.

Supported providers today (see `lib/llm/factory.ts`): Anthropic Claude, OpenAI ChatGPT, and
Google Gemini. Whichever one is configured needs a valid API key from that provider, which the
instructor has to obtain themselves (e.g. an OpenAI API key from platform.openai.com) — this app
doesn't provide LLM access itself.

**Important, non-obvious gotcha:** only **one** LLM configuration can be active across the
**entire deployment at a time** — this is a global setting, not a per-instructor one
(`uq_instructor_llm_config_one_active` is a global unique index, not scoped to a user). If your
deployment has multiple instructors using LLM-graded activities, they are all sharing the same
active provider/API key. If one instructor changes the active config, it changes it for everyone.
There's no per-course or per-instructor override.

If an LLM-graded activity was created using the app's built-in seed data (rather than an
instructor writing their own prompts), submissions to it will always fail with "the instructor
who created this prompt has not configured an LLM provider" — this is expected. Only
instructor-authored prompts can be graded; the seeded ones exist for demo/browsing purposes only.

## One-time setup checklist (for a new deployment)

Beyond what's in the README, these are easy to miss:

1. **Run `supabase/seed.sql`, not just `supabase/schema.sql`.** The schema alone creates empty
   tables. Without the seed data (the built-in question bank), the three built-in quiz types will
   fail to start a session with a 400 error the first time any student tries them.
2. **Create both Storage buckets, not just one.** The README walks through `avatars` (public,
   MIME types `image/png, image/jpeg, image/webp`, 2 MB limit). You also need a second **public**
   bucket named `course-covers` for instructor-uploaded course cover images — same allowed MIME
   types, but a **4 MB** size limit instead of 2 MB.
3. **Set `INSTRUCTOR_SIGNUP_CODE` to a real random value before anyone signs up**, not the
   placeholder from `.env.example`. See above.
4. **Don't expect to browse the question bank via the Supabase Table Editor/anon key.** The
   question-bank tables (`question`, `answer`, etc.) have Row Level Security enabled with *no*
   policies at all, so they're only reachable through the app's own API routes (which use the
   service-role key server-side). This is intentional, not a misconfiguration — if you need to
   inspect or fix data directly, do it from the Supabase SQL Editor (which runs with elevated
   privileges), not through a client-side/anon connection.

## "What happens if a professor deletes a course?"

Deleting a course (Instructor → Courses → course → Delete) removes the course itself, its join
code, and unenrolls every student from it. It does **not** delete any student's quiz history,
scores, or titles — those are tracked independently of any course, so a student's progress
survives even if every course they took it through is later deleted. The only things lost are the
course record, its roster, and its CSV export.

## "A student can't see a quiz/course an instructor made"

A newly created question catalog ("quiz") isn't visible to any student until an instructor
explicitly composes it into an **Assembled Quiz** for a specific course (Instructor → Assembled
Quizzes). Creating a catalog and adding questions to it is not enough by itself — it also has to
be linked to a course through an assembled quiz, and the student has to be enrolled in that
course. If a student says they don't see an activity that was "clearly" created, this composition
step is the first thing to check.
