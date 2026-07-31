# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # install dependencies
npm run dev        # start dev server (http://localhost:3000)
npm run build      # production build
npm test           # run all tests (vitest)
npx vitest run __tests__/api/sessions.test.ts              # run a single test file
npx vitest run __tests__/api/sessions.test.ts -t "resume"  # run tests matching a name
```

There is no lint or typecheck script; `npm run build` is the type check.

## Environment setup

Copy `.env.example` to `.env.local` and fill in your Supabase credentials. Then, in the Supabase SQL editor, run `supabase/schema.sql` followed by `supabase/seed.sql` (the question bank — without it every session start returns 400), and create a **public** Storage bucket named `avatars` for profile images.

`lib/supabase.ts` accepts either `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` and exposes three factories, each returning `null` when its key is missing so routes can answer 500 instead of a confusing Supabase error:

- `getSupabaseClient()` — service-role key preferred, anon fallback. Used by every data route; it bypasses RLS, which is why those routes must derive `user_id` from the token themselves.
- `getSupabaseAuthClient()` — anon key preferred. Only `login`, so Supabase issues a real user session.
- `getSupabaseAdminClient()` — service role, no fallback. Only `register` (`auth.admin.createUser`, which bypasses email confirmation).

Clients are created per call with `persistSession: false` — no singleton, no shared state.

## Architecture

Next.js 14 App Router, Tailwind, Supabase. The product is a requirements-practice app for students; `docs/requirements/requirements.md` is the spec, and its identifiers (`REQ-DL-3.1`, `REQ-PL-2.1`, `REQ-GAM-BL-1`, …) are cited in code comments — read the referenced requirement before changing behavior that a comment ties to one.

### Two half-connected worlds — read this first

The backend and the UI are currently built against different data sources:

- **API routes + `lib/*Queries.ts` + `supabase/schema.sql`** are the real implementation (sessions, answers, feedback, score, titles), fully covered by tests.
- **`lib/activityContent.ts` + `lib/activityStore.ts`** are a **localStorage mock** of that same domain — a hardcoded question bank and a `rc_activity_progress_v1` key. Every activity page (`app/activities/**`) and `components/AppShell.tsx` still reads from the mock, not the API. Only `app/profile/page.tsx` and login/register talk to real routes.

The two halves don't even share vocabulary: the UI keys activities by slug (`weak-user-stories`), the DB by `activity_type` (`IDENTIFY_WEAK_USER_STORIES`), and no mapping exists yet. Wiring a page to the backend means adding that mapping and replacing `activityStore` calls with `fetch`, keeping the function signatures — `lib/activityStore.ts` was written to be swapped out this way.

### Auth flow

`lib/authClient.ts` is the only place the UI talks to auth routes; it stores the Supabase `access_token` in localStorage under `access_token` (register additionally signs in, since the admin API returns a user but no session). `lib/useAccessToken.ts` is how pages gate on it. Every protected API route then repeats the same preamble: read `Authorization: Bearer …`, `supabase.auth.getUser(token)`, and derive `user_id` from the result — **never** from the body, query string, or path. The `/api/students/{studentId}/*` routes compare the path param against the token's user and 403 on mismatch.

### Session model (the core domain)

- **One in-progress session per (user, activity_type)**, enforced by the partial unique index `uq_session_log_one_active`. `POST /api/sessions` is therefore idempotent: it returns the existing session with `resumed: true` (200) instead of creating a second one, and treats a `23505` race as "someone else started it". "Start" and "resume" are the same call.
- **The current question is derived, never stored.** It is the lowest `position` in `session_to_question` without a row in `answered_question_log` (`nextUnansweredPosition` in `lib/sessionQueries.ts`). Do not add a `current_question_index` column — the absence of a mutable pointer is what makes multi-device resume conflict-free.
- **Write before disclose.** `POST /api/sessions/{id}/answers` commits the answer first and reveals `correct`/`explanation` second; `POST .../feedback` only serves a solution for an option already present in `answered_question_log`. Otherwise the endpoints become an oracle for trying options until one is right.
- **Scores roll up in the database.** The `trg_answered_question_log_score` trigger adds to `session_log.cumulative_score` inside the insert's transaction; routes re-read the row afterwards rather than computing the total locally.
- **Column visibility is a query-level concern.** `SESSION_QUESTION_COLUMNS` in `lib/sessionQueries.ts` deliberately omits `is_correct` and `explanation`; only `loadQuestionOptions` (feedback path) selects them. Keep new queries on that split.
- `lib/sessionRules.ts` holds the shared constants (`QUESTIONS_PER_SESSION = 4`, `START_DIFFICULTY_LEVEL = 1`, `PASS_RATIO = 0.8`, `SESSION_COLUMNS`) so routes cannot drift apart. Partial credit is a known gap: `scoreForAnswer` is all-or-nothing until `answer` gains a score column.
- Gamification is derived, not stored: `lib/scoreQueries.ts` sums the best *passing* score per (activity_type, difficulty_level); `lib/titleQueries.ts` looks up `title_definition` by the highest passed level per activity type. Nothing about score or title lives on the student row.

### Database

`supabase/schema.sql` is the single migration (plain DDL, no `IF NOT EXISTS` — its footer documents the drop/rename paths for re-running). Notable: the profile table is `"user"` (a reserved word — quoted in SQL, plain `.from('user')` in supabase-js) and FKs to `auth.users`; the question-bank tables have **RLS enabled with no policies at all**, so they are unreachable except through a service-role route. Adding a table that the client must not read directly should follow the same pattern.

Valid `activity_type` values live in `lib/activityTypes.ts` and must match `question.activity_type` in `supabase/seed.sql`; the DB does not enforce the set yet.

### Tests

Vitest, `environment: 'node'`, glob `__tests__/**/*.test.ts`, no React/DOM tests. Each file mocks `lib/supabase` with a `vi.hoisted` fake whose `from(table)` returns a chainable builder — `select/eq/in/order` are no-ops, and the builder is *thenable* so queries without `.single()` resolve too. Results are **queued per table** (`queue('session_log', { data, error })`) and shifted in call order, and the mock records `inserts`/`deletes`/`tables` for asserting what the route did. Route handlers are imported directly and invoked as `POST(new Request(...), { params })`. When adding a route, copy this harness from the nearest existing test rather than inventing a new mocking style.

## Styling Guidelines

Tailwind CSS is the single, project-wide approach to styling — no CSS Modules, styled-components, or component libraries. Every page and component styles exclusively through Tailwind utility classes.

**Design tokens — the source of truth:**
- Brand colors are defined once as CSS custom properties in `app/globals.css` (`:root`, prefixed `--rc-*`), then exposed as named Tailwind colors under the `brand` key in `tailwind.config.js` (`theme.extend.colors.brand`). Use these tokens (`bg-brand-navy`, `text-brand-purple`, `border-brand-navy-border`, …) instead of writing raw hex values like `bg-[#7C4DFF]`.
- Available tokens: `brand-navy` / `brand-navy-2` / `brand-navy-border` / `brand-void` (dark surfaces), `brand-purple` / `brand-purple-dark` / `brand-purple-glow` (primary accent), `brand-teal` / `brand-teal-dark` / `brand-teal-ink` (secondary accent), `brand-gold` (rewards/XP/achievements only), `brand-danger` / `brand-danger-light` (errors, destructive actions), `brand-ink` / `brand-ink-muted` (text on dark surfaces).
- For the light/white content areas (inside `AppShell`'s `<main>`), use Tailwind's built-in gray scale (`text-gray-500`, `bg-gray-50`, `border-gray-100`) rather than inventing new grays.
- Border radius: use `rounded-brand-sm` (9px, small icon buttons), `rounded-brand-md` (10px, inputs/buttons/nav items), `rounded-brand-lg` (20px, cards/panels), or Tailwind's built-in `rounded-full` (pills, avatars). Don't add new arbitrary `rounded-[Npx]` values.
- Spacing: use Tailwind's default spacing scale (`p-4`, `gap-2.5`, `mb-5`, …) — no arbitrary pixel spacing.
- Typography: the font family is set once in `app/globals.css` (`body { font-family: ... }`). Don't override `font-family` in individual components.

**Rules for new pages/components:**
- No inline `style={{ ... }}` for anything expressible as a Tailwind class. Inline styles are only for genuinely dynamic, per-instance values (e.g. per-sparkle animation offsets in `components/PasswordField.tsx`).
- No new raw hex colors in `className`. If a needed color isn't in the `brand` palette yet, add it as a `--rc-*` variable in `app/globals.css` and a matching token in `tailwind.config.js` first, then use the token.
- Reuse existing shared components before writing new markup: `components/AppShell.tsx` (page shell/nav for authenticated pages), `components/ActivityCard.tsx`, `components/QuestionCard.tsx`, `components/FeedbackCard.tsx`, `components/PasswordField.tsx`. Prefer extending one of these over duplicating its markup.
- Custom CSS animations that Tailwind utilities can't express (`@keyframes`, gradient-text glow, etc.) use `<style jsx>` (styled-jsx, built into Next.js) scoped to the component — see `app/dashboard/page.tsx` and `components/PasswordField.tsx`. Reference the `--rc-*` variables inside these blocks instead of hardcoding new hex values, so raw CSS and Tailwind classes never drift apart.

**Known gap:** existing pages/components still contain literal arbitrary-value classes (e.g. `bg-[#7C4DFF]`) that predate this token system. New code should use the `brand-*` tokens above; migrating existing files onto the tokens is a separate follow-up, not required for this to take effect going forward.
