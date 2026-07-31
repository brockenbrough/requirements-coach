# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # install dependencies
npm run dev        # start dev server (http://localhost:3000)
npm run build      # production build
npm test           # run all tests (vitest)
npx vitest run __tests__/api/auth.test.ts   # run a single test file
```

## Environment setup

Copy `.env.example` to `.env.local` and fill in your Supabase credentials before running the app. The register route uses `SUPABASE_SERVICE_ROLE_KEY` (admin API); the login route works with `SUPABASE_ANON_KEY`. Both `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` are read by `lib/supabase.ts` — either prefix works.

## Architecture

This is a Next.js 14 App Router project with Tailwind CSS and Supabase auth.

**Request flow for auth:**
1. Client pages (`app/login/page.tsx`, `app/register/page.tsx`) are `'use client'` forms that POST to the API routes via `fetch`.
2. API routes (`app/api/auth/login/route.ts`, `app/api/auth/register/route.ts`) call `getSupabaseClient()` from `lib/supabase.ts` and delegate to the Supabase JS SDK.
3. `lib/supabase.ts` — `getSupabaseClient()` returns `null` when env vars are missing; both routes guard against this and return a 500.

**Key design decisions:**
- Register uses `supabase.auth.admin.createUser` (service-role key required), so registration bypasses email confirmation.
- Login returns the full Supabase session object under the `session` key.
- `getSupabaseClient` creates a new client per call with `persistSession: false` — there is no singleton or shared state.

**Tests (`__tests__/api/auth.test.ts`):**
- Vitest with `environment: 'node'`.
- `lib/supabase` is fully mocked via `vi.mock`; tests import the route handler functions directly and call them with `new Request(...)`.
- Tests live in `__tests__/` and are matched by the glob `__tests__/**/*.test.ts`.

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
