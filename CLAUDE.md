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
