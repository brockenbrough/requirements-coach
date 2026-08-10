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

Copy `.env.example` to `.env.local` and fill in your Supabase credentials. Then, in the Supabase SQL editor, run `supabase/schema.sql` followed by `supabase/seed.sql` (the question bank — without it every session start returns 400), and create a **public** Storage bucket named `avatars` for profile images. (README.md's mention of a `myapp_profile` table is stale — the profile table is `"user"`.)

`lib/supabase.ts` accepts either `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` and exposes three factories, each returning `null` when its key is missing so routes can answer 500 instead of a confusing Supabase error:

- `getSupabaseClient()` — service-role key preferred, anon fallback. Used by every data route; it bypasses RLS, which is why those routes must derive `user_id` from the token themselves.
- `getSupabaseAuthClient()` — anon key preferred. Only `login` and `refresh`, so Supabase issues/renews a real user session.
- `getSupabaseAdminClient()` — service role, no fallback. Only `register` (`auth.admin.createUser`, which bypasses email confirmation).

Clients are created per call with `persistSession: false` — no singleton, no shared state.

## Architecture

Next.js 14 App Router, Tailwind, Supabase. The product is a requirements-practice app for students; `docs/requirements/requirements.md` is the spec, and its identifiers (`REQ-DL-3.1`, `REQ-PL-2.1`, `REQ-GAM-BL-1`, …) are cited in code comments — read the referenced requirement before changing behavior that a comment ties to one. Code comments also cite GitHub issue numbers (`GitHub #82`, `#120`, `#149`, `#169`, …) for feature-level context.

### Two half-connected worlds — read this first

Parts of the app were built against real API routes, parts against localStorage mocks. The wiring-over is in progress, not finished. **Before trusting any data source, grep for who actually reads it.**

**1. Real, tested backend.** API routes + `lib/*Queries.ts` + `supabase/schema.sql` are the real implementation (sessions, answers, feedback, score, titles, activity log, instructor statistics, LLM-graded acceptance-criteria submissions), fully covered by tests. `lib/sessionClient.ts` is the UI's one gateway to the MCQ session routes — same role as `lib/authClient.ts` for auth. The student quiz flow is fully migrated: `app/activities/[slug]/page.tsx`, `app/activities/[slug]/play/page.tsx`, `app/dashboard/log/page.tsx`, and the session lists on `app/dashboard/page.tsx` / `app/activities/page.tsx` all go through `sessionClient`. The slug↔`activity_type` mapping is declared in exactly one place: `ActivityDefinition.activityType` in `lib/activityContent.ts`.

`write-acceptance-criteria` is a fourth, structurally different activity (GitHub #149, REQ-FU-2) that sits outside that mapping entirely — no question bank, no `activity_type`, no `session_log` row. `app/activities/write-acceptance-criteria/page.tsx` goes through `lib/acceptanceCriteriaClient.ts` to `GET .../user-story` (draws a random `user_story` row) and `POST .../submissions` (write-before-disclose: inserts the `submission` row, then calls `getLLMProvider` to grade it and updates the same row with the score/feedback). `ActivitySlug` in `lib/activityContent.ts` includes it only so `ActivityCard`/`activityStore.ts` can type all four activities uniformly — see the comment there before assuming it behaves like the other three.

**2. The leveling mock.** `lib/activityStore.ts` is still a localStorage mock (`rc_activity_progress_v1`) of the leveling/history side of the domain — current difficulty level, best score, earned title. It is now read by only three places: `app/activities/page.tsx` (`getActivityState`/`getBestScore`/`getTitle`), `app/dashboard/page.tsx` (`getActivityState`), and `components/AppShell.tsx` (`getHighestTitleOverall`). Those same pages also fetch the real session list, so a page can trust two disagreeing sources at once — the mock's `state.inProgress` versus the API's actual in-progress sessions. `app/activities/[slug]/page.tsx` no longer touches it at all: "is something running?" there comes only from `loadCurrentSession`. This module is the main thing left to migrate.

The front-end-first instructor work that used to sit in a third "UI-only mock arrays" world is now gone: `lib/mockQuestions.ts` (`MOCK_QUESTIONS`) was replaced by `GET /api/instructor/questions` (GitHub #170) — `app/instructor/questions/page.tsx` fetches through `sessionClient`'s `loadInstructorQuestions` like every other instructor list page, though its add/edit flow (`QuestionFormModal`) still only mutates local React state rather than calling the existing `POST /api/instructor/questions`. (`lib/mockStudentActivity.ts` was the other one and is gone too — the instructor dashboard and roster now read `GET /api/instructor/activities`.)

Also dead or unwired, so grep before assuming:
- `lib/activityContent.ts`'s `questionBank` (and `getQuestion`/`questionsForLevel`) is **not** used for gameplay — the play page gets prompts, options, and scoring from the server. `activityContent.ts` is still live for display-only fields (`name`, `summary`, `instructions`, `category`, `titles`) and the slug↔activityType mapping.
- `GET /api/activities/:activityType/questions` and `GET /api/questions/:questionId/options` require a valid bearer token (any authenticated user, not instructor-only) but are otherwise unchanged; no page calls either yet.
- `requireInstructor` in `lib/instructorAuth.ts` (GitHub #169) guards every `/api/instructor/*` route: `GET .../activities`, `GET .../sessions`, `GET .../statistics`, `GET .../students/{id}/history`, and `POST .../llm-config`. Its docblock contains the exact usage snippet any further instructor route should copy — in particular the 403-with-no-body branch.
- `user_story`, `submission`, and `instructor_llm_config` tables (REQ-FU-2, "Write Acceptance Criteria") exist in `supabase/schema.sql`, and `POST /api/activities/write-acceptance-criteria/submissions` calls `getLLMProvider` (`lib/llm/factory.ts`) against them — see world 1 above. `submission.llm_score`/`llm_feedback`/`llm_provider`/`graded_at` are nullable for the same "write before disclose" reason as `answered_question_log`: the route inserts the row at submit time, then fills in the grading result after the LLM call returns; a crash in between leaves an ungraded row rather than a graded answer that was never recorded. `instructor_llm_config.api_key` is masked by construction: `POST /api/instructor/llm-config`'s `CONFIG_COLUMNS` never selects it back, and `uq_instructor_llm_config_one_active` is a *global* partial unique index (not per-instructor) — at most one config is active across the whole app. There is no `GET /api/instructor/llm-config` yet, so `components/LLMProviderSettingsForm.tsx` still reads/writes through the localStorage-backed mock in `lib/instructorLlmConfigClient.ts` (its header comment documents the gap) even though the real `POST` route exists and is tested — another two-worlds split within a single feature.
- The question bank's `activity_type` columns are now FK-constrained against a real `activity_type` lookup table (GitHub #122/#123), not free text — `lib/activityTypes.ts`'s "Open point: the DB does not enforce this set yet" comment predates that migration and is stale.
- `question.user_id` (GitHub #201) records which instructor authored a question, and `GET /api/instructor/questions` (GitHub #170) now scopes to it (`.eq('user_id', guard.user_id)`) rather than returning the whole bank. It's nullable, and `supabase/seed.sql` inserts every question with no `user_id` at all — so a fresh instructor's Question Bank page is genuinely empty until they've added questions of their own via the existing `POST /api/instructor/questions`.

### Auth flow

`lib/authClient.ts` is the only place the UI talks to auth routes. It stores both the Supabase `access_token` and `refresh_token` in localStorage (register additionally signs in, since the admin API returns a user but no session). `components/UserProvider.tsx`'s `useUser()` is the single source of truth for the token plus the signed-in profile, mounted once in `app/layout.tsx`.

Session renewal is deliberately two-pronged and there is **no guest/placeholder state**: `UserProvider` refreshes proactively on a 45-minute interval, and reactively when `/api/profile` answers 401 — only if `refreshAccessToken()` also fails is the session cleared and `token` dropped to null. A transient fetch error is explicitly *not* treated as an invalid session; keep that distinction if you touch `refresh()`.

Pages gate on role via `lib/useRequireRole.ts` (`useRequireRole('student' | 'instructor')`, GitHub #82). Callers must return `null` while `!authorized` — the redirect happens in an effect, so rendering early flashes the wrong page. The two roles are asymmetric about a missing profile row (normal right after registration): `'student'` lets it through, `'instructor'` does not and redirects to `/profile`. Treat a page's required role as load-bearing — it's what keeps a student off `/instructor/*` and an instructor out of the quiz-taking flow under `/activities/*`.

Instructor role assignment happens in `app/api/auth/register/route.ts`: a hardcoded `INSTRUCTOR_SIGNUP_CODE` compared **server-side only**, written into the auth user's metadata (the `"user"` profile row doesn't exist until the profile form is submitted, where `app/api/profile/route.ts` reads the role back out).

Every protected API route then repeats its own preamble: read `Authorization: Bearer …`, `supabase.auth.getUser(token)`, and derive `user_id` from the result — **never** from the body, query string, or path. The `/api/students/{studentId}/*` routes compare the path param against the token's user and 403 on mismatch (no instructor exception on any of them today).

### Session model (the core domain)

- **One in-progress session per (user, activity_type)**, enforced by the partial unique index `uq_session_log_one_active`. `POST /api/sessions` is therefore idempotent: it returns the existing session with `resumed: true` (200) instead of creating a second one, and treats a `23505` race as "someone else started it". "Start" and "resume" are the same call.
- **The current question is derived, never stored.** It is the lowest `position` in `session_to_question` without a row in `answered_question_log` (`nextUnansweredPosition` in `lib/sessionQueries.ts`). Do not add a `current_question_index` column — the absence of a mutable pointer is what makes multi-device resume conflict-free, and it's why `GET /api/sessions/current` is a pure read with nothing to merge.
- **Write before disclose.** `POST /api/sessions/{id}/answers` commits the answer first and reveals `correct`/`explanation` second; `POST .../feedback` only serves a solution for an option already present in `answered_question_log`. Otherwise the endpoints become an oracle for trying options until one is right.
- **Scores roll up in the database.** The `trg_answered_question_log_score` trigger adds to `session_log.cumulative_score` inside the insert's transaction; routes re-read the row afterwards rather than computing the total locally.
- **Column visibility is a query-level concern.** `SESSION_QUESTION_COLUMNS` in `lib/sessionQueries.ts` deliberately omits `is_correct` and `explanation`; only `loadQuestionOptions` (feedback path) selects them. Keep new queries on that split.
- **Option order is shuffled server-side** with `lib/shuffleArray.ts` (Fisher-Yates, not a `sort()` comparator — the biased-comparator version was a real bug, see `__tests__/lib/shuffleArray.test.ts`).
- `lib/sessionRules.ts` holds the shared constants (`QUESTIONS_PER_SESSION = 4`, `START_DIFFICULTY_LEVEL = 1`, `PASS_RATIO = 0.8`, `SESSION_COLUMNS`, `SESSION_STATUSES`) so routes cannot drift apart. Partial credit is a known gap: `scoreForAnswer` is all-or-nothing until `answer` gains a score column.
- Gamification is derived, not stored: `lib/scoreQueries.ts` sums the best *passing* score per (activity_type, difficulty_level); `lib/titleQueries.ts` looks up `title_definition` by the highest passed level per activity type. Nothing about score or title lives on the student row.

### Reading sessions: which route answers which question

Five read endpoints look similar and are not interchangeable — pick by the question being asked, and keep new ones on the same split:

| Route | Question it answers | Empty result |
|---|---|---|
| `GET /api/sessions?status=…` | "What did I do lately", one status, all activity types | `200` `[]` |
| `GET /api/sessions/current?activityType=` | "Resume this activity" — session + questions + answers so far | `200` with `session: null` |
| `GET /api/sessions/in-progress[?activityType=]` | "Is something running?" — no questions/prompts | `404` *with* activityType, `200` `[]` without |
| `GET /api/sessions/completed?activityType=` | "How did I do at this activity" — attempt history | `200` `[]` |
| `GET /api/students/{id}/activities` | Full timeline: every status, every activity type, merged | `200` `[]` |
| `GET /api/instructor/activities` | Same timeline, but class-wide, `+ studentId`/`studentName` | `200` `[]` |

(`GET /api/students/{id}/history` is the completed-only, cross-activity variant of the second-to-last one, per REQ-PL-3.1. `GET /api/instructor/students/{id}/history` is that same route's instructor-facing counterpart — identical columns and ordering, gated by `requireInstructor` instead of a `studentId === caller` check, and its own 404 for an unknown `studentId` since the caller didn't just authenticate as them.)

The instructor route is the one read that deliberately returns rows the caller doesn't own, which is why `requireInstructor` runs before any query and why its `loadAllStudentActivity` filters the joined `"user"` row on `role = 'student'` with an **inner** join — a non-inner join would null the embed instead of dropping the row, and instructors would appear in their own report. Only students who have attempted something appear at all; the roster is derived from attempts, so an enrolled student with zero sessions is invisible (known gap, separate story). `GET /api/instructor/sessions` and `GET /api/instructor/statistics` (class average + pass rate per quiz, `lib/quizStatisticsQueries.ts`, GitHub #114) are guarded the same way; both currently treat "every quiz" as every row in the `activity_type` table, since there is no professor-to-quiz ownership in the schema yet (same gap as #115's "students of the current prof").

### Client-side caching

`lib/scoreStore.ts`, `lib/completedSessionsStore.ts`, `lib/completedAttemptsStore.ts`, and `lib/activityLogStore.ts` are a *different* kind of localStorage use from `activityStore.ts` — not mocks, but caches in front of real API calls. All four share one shape: a versioned key, SSR-guarded read/write, only typed getters/setters exported, keyed by `studentId` (`completedAttemptsStore` additionally by `activityType`). `sessionClient`'s loaders take an optional `studentId` to opt into the cache and a `forceRefresh` flag to bypass and re-cache it. Copy this shape for any new cache.

The invalidation rule differs: score and completed-sessions only change when a session *completes* (the play page's `handleContinue` refreshes them there), but `activityLogStore` also contains in-progress and abandoned sessions — anything that starts, answers, or abandons must `forceRefresh` it too.

`loadInstructorActivities` is deliberately **not** cached, and shouldn't be retrofitted: all four stores hold the student's own data, changed only by that student's own actions, so the page causing the change can refresh it. The class-wide list changes whenever *any* student answers something, which the instructor's tab never learns about — there is no invalidation point, only staleness.

### Database

`supabase/schema.sql` is the single migration (plain DDL, no `IF NOT EXISTS` — its footer documents the drop/rename paths for re-running). Notable: the profile table is `"user"` (a reserved word — quoted in SQL, plain `.from('user')` in supabase-js) and FKs to `auth.users`; the question-bank tables have **RLS enabled with no policies at all**, so they are unreachable except through a service-role route. Adding a table the client must not read directly should follow the same pattern. `session_log`/`answered_question_log`/`submission` do have own-row policies, but every data route uses the service-role client and bypasses them — the route, not the database, is what enforces scoping.

Valid `activity_type` values live in `lib/activityTypes.ts` and must match `question.activity_type` in `supabase/seed.sql`. The DB enforces the set via a real lookup table, `activity_type` (GitHub #122), with `question`/`session_log`/`title_definition` FK'd against it (#123) — `lib/activityTypes.ts`'s own header comment still says this is an open point; it isn't, don't trust that comment over the schema.

### Tests

Vitest, `environment: 'node'`, glob `__tests__/**/*.test.ts`, no React/DOM tests — the mock-backed instructor UI and the localStorage stores are untested by design.

Route tests (`__tests__/api/`) mock `lib/supabase` with a `vi.hoisted` fake whose `from(table)` returns a chainable builder — `select/eq/in/order` are no-ops, and the builder is *thenable* so queries without `.single()` resolve too. Results are **queued per table** (`queue('session_log', { data, error })`) and shifted in call order, and the mock records `inserts`/`deletes`/`tables` for asserting what the route did. Route handlers are imported directly and invoked as `POST(new Request(...), { params })`.

Pure-helper tests (`__tests__/lib/`) skip `vi.mock` entirely — `requireInstructor` takes its Supabase client as an argument precisely so its test can pass in a locally built fake. Prefer that shape for new helpers.

When adding a route, copy the harness from the nearest existing test rather than inventing a new mocking style.

## Styling Guidelines

Tailwind CSS is the single, project-wide approach to styling — no CSS Modules, styled-components, or component libraries. Every page and component styles exclusively through Tailwind utility classes.

**Design tokens — the source of truth:**
- Brand colors are defined once as CSS custom properties in `app/globals.css` (`:root`, prefixed `--rc-*`), then exposed as named Tailwind colors under the `brand` key in `tailwind.config.js` (`theme.extend.colors.brand`). Use these tokens (`bg-brand-navy`, `text-brand-purple`, `border-brand-navy-border`, …) instead of writing raw hex values like `bg-[#7C4DFF]`.
- Available tokens: `brand-navy` / `brand-navy-2` / `brand-navy-border` / `brand-void` (dark surfaces), `brand-purple` / `brand-purple-dark` / `brand-purple-glow` (primary accent), `brand-teal` / `brand-teal-dark` / `brand-teal-ink` (secondary accent), `brand-gold` / `brand-gold-dark` (rewards/XP/achievements only), `brand-green` / `brand-green-dark` (success/passed states), `brand-danger` / `brand-danger-light` (errors, destructive actions), `brand-ink` / `brand-ink-muted` (text on dark surfaces).
- For the light/white content areas (inside `AppShell`'s `<main>`), use Tailwind's built-in gray scale (`text-gray-500`, `bg-gray-50`, `border-gray-100`) rather than inventing new grays.
- Border radius: use `rounded-brand-sm` (9px, small icon buttons), `rounded-brand-md` (10px, inputs/buttons/nav items), `rounded-brand-lg` (20px, cards/panels), or Tailwind's built-in `rounded-full` (pills, avatars). Don't add new arbitrary `rounded-[Npx]` values.
- Spacing: use Tailwind's default spacing scale (`p-4`, `gap-2.5`, `mb-5`, …) — no arbitrary pixel spacing.
- Typography: the font family is set once in `app/globals.css` (`body { font-family: ... }`). Don't override `font-family` in individual components.

**Rules for new pages/components:**
- No inline `style={{ ... }}` for anything expressible as a Tailwind class. Inline styles are only for genuinely dynamic, per-instance values (e.g. per-sparkle animation offsets in `components/PasswordField.tsx`).
- No new raw hex colors in `className`. If a needed color isn't in the `brand` palette yet, add it as a `--rc-*` variable in `app/globals.css` and a matching token in `tailwind.config.js` first, then use the token.
- Reuse existing shared components before writing new markup: `components/AppShell.tsx` (page shell/nav for authenticated pages; it branches its nav on `profile?.role`), `components/ActivityCard.tsx`, `components/QuestionCard.tsx`, `components/FeedbackCard.tsx`, `components/PasswordField.tsx`, and on the instructor side `components/ActivityLogTable.tsx` / `ActivityLogRow.tsx` (shared with the student activity log), `InstructorStudentCard.tsx`, `QuestionFormModal.tsx`. Prefer extending one of these over duplicating its markup.
- Custom CSS animations that Tailwind utilities can't express (`@keyframes`, gradient-text glow, etc.) use `<style jsx>` (styled-jsx, built into Next.js) scoped to the component — see `app/dashboard/page.tsx` and `components/PasswordField.tsx`. Reference the `--rc-*` variables inside these blocks instead of hardcoding new hex values, so raw CSS and Tailwind classes never drift apart.

**Known gap:** existing pages/components still contain literal arbitrary-value classes (e.g. `bg-[#7C4DFF]`) that predate this token system. New code should use the `brand-*` tokens above; migrating existing files onto the tokens is a separate follow-up, not required for this to take effect going forward.
