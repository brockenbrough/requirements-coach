'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      router.push('/profile');
    } else {
      setMessage(data.error || 'Login failed.');
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl shadow-black/30">
        <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">Student Login</p>
        <h1 className="mt-4 text-3xl font-semibold">Welcome back</h1>
        <p className="mt-2 text-slate-300">Use this page to test the login API route in the browser.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block text-sm text-slate-200">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none ring-0 transition focus:border-emerald-400"
              placeholder="student@example.com"
            />
          </label>

          <label className="block text-sm text-slate-200">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none ring-0 transition focus:border-emerald-400"
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? 'Signing in…' : 'Log in'}
          </button>
        </form>

        {message ? <p className="mt-4 rounded-xl border border-slate-700 bg-slate-800/80 p-3 text-sm text-slate-100">{message}</p> : null}

        <p className="mt-6 text-sm text-slate-300">
          Need an account? <Link href="/register" className="text-emerald-300 hover:underline">Create one here</Link>
        </p>
        <p className="mt-2 text-sm text-slate-300">
          Back to <Link href="/" className="text-emerald-300 hover:underline">home</Link>
        </p>
      </section>
    </main>
  );
}
