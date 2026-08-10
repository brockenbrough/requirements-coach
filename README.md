# Requirements Coach

A gamified practice app that helps students write and evaluate software requirements, built with Next.js, Tailwind CSS, and Supabase.

## Prerequisites

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com) and create a new project. Wait for the database to finish provisioning.

### 2. Get your connection variables

In your Supabase project, go to **Project Settings → GENERAL** and copy:
- **Project ID** → use to form `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`. Take the value and construct a path like this: "https://xxxx.supabase.co" by adding the https part and the supabase.co part.  Both SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL use thissame value.

In your Supabase project, go to **Project Settings → API Keys/Legacy anon, service_role API keys** and copy:
- **anon public key** → use as `SUPABASE_ANON_KEY`
- **service_role secret key** → use as `SUPABASE_SERVICE_ROLE_KEY`

Create a `.env.local` file in the project root (copy from `.env.example`) and fill in those values:

```
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
NEXT_PUBLIC_SUPABASE_URL="https://your-project-id.supabase.co"
```

### 3. Run the schema script

In your Supabase project, open the **SQL Editor** and run the contents of [`supabase/schema.sql`](supabase/schema.sql). This creates the `myapp_profile` table used by the profile page.

### 4. Create the avatars storage bucket

In your Supabase project, go to **Storage → New bucket**, name it `avatars`, and check **Public bucket**.

## Quick start

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # run all tests
```
