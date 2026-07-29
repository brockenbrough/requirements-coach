'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Dev-only convenience login so local testing doesn't require retyping credentials.
// Update these to match a real test account in your Supabase project, or remove
// them once one is seeded. Only active when NODE_ENV === 'development', so this
// never ships prefilled in a production build.
const DEV_TEST_EMAIL = 'test@example.com';
const DEV_TEST_PASSWORD = 'TestPassword123!';
const isDev = process.env.NODE_ENV === 'development';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(isDev ? DEV_TEST_EMAIL : '');
  const [password, setPassword] = useState(isDev ? DEV_TEST_PASSWORD : '');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    setLoading(false);

    if (response.ok) {
      const accessToken = data?.session?.session?.access_token;
      if (accessToken) localStorage.setItem('access_token', accessToken);
      router.push('/dashboard');
      return;
    }

    // Dev-only: no Supabase project configured yet, so simulate a successful
    // login instead of blocking local click-through testing. Disappears the
    // moment real Supabase credentials are added (the API then returns a
    // different error, or succeeds for real).
    if (isDev && data?.error === 'Supabase credentials are not configured.') {
      localStorage.setItem('access_token', 'dev-mock-token');
      router.push('/dashboard');
      return;
    }

    setMessage(data.error || 'Login failed.');
  }

  return (
    <main className="min-h-screen bg-[#0e0b1e] flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-[20px] border border-[#332b6b] bg-[#241f52] p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#FFD666] bg-[#1b1642] text-xs font-extrabold text-[#FFD666]">
            RC
          </span>
          <span className="text-lg font-extrabold text-[#FFD666]">Requirements Coach</span>
        </div>
        <h1 className="text-2xl font-extrabold text-[#F3F1FF]">Welcome back</h1>
        <p className="mt-2 text-sm font-semibold text-[#A79FC9]">Log in to continue your training.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block text-sm font-bold text-[#A79FC9]">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-1 w-full rounded-[10px] border border-[#332b6b] bg-[#1b1642] px-4 py-3 text-[#F3F1FF] outline-none ring-0 transition focus:border-[#7C4DFF]"
              placeholder="student@example.com"
            />
          </label>

          <label className="block text-sm font-bold text-[#A79FC9]">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-1 w-full rounded-[10px] border border-[#332b6b] bg-[#1b1642] px-4 py-3 text-[#F3F1FF] outline-none ring-0 transition focus:border-[#7C4DFF]"
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#7C4DFF] px-4 py-3 font-extrabold text-white transition hover:bg-[#6234d1] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? 'Signing in…' : 'Log in'}
          </button>
        </form>

        {message ? <p className="mt-4 rounded-xl border border-[#332b6b] bg-[#1b1642] p-3 text-sm text-[#F3F1FF]">{message}</p> : null}

        <p className="mt-6 text-sm font-semibold text-[#A79FC9]">
          Need an account? <Link href="/register" className="text-[#2DD4BF] hover:underline">Create one here</Link>
        </p>
        {isDev ? (
          <p className="mt-4 text-xs font-semibold text-[#5c5480]">Dev mode: form prefilled with test credentials.</p>
        ) : null}
      </section>
    </main>
  );
}
