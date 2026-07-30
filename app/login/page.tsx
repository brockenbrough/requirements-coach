'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { login } from '../../lib/authClient';

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

    const result = await login(email, password);

    if (!result.ok) {
      setLoading(false);
      setMessage(result.error);
      return;
    }

    router.push('/dashboard');
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
      </section>
    </main>
  );
}
