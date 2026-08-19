'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { register } from '../../lib/authClient';
import { PasswordField } from '../../components/PasswordField';
import { useUser } from '../../components/UserProvider';

export default function RegisterPage() {
  const router = useRouter();
  const { refresh } = useUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showInstructorCode, setShowInstructorCode] = useState(false);
  const [instructorCode, setInstructorCode] = useState('');
  // GitHub #440: entering a wrong instructor code used to silently create a student account
  // with zero feedback — the server accepts the request either way (see lib/authClient.ts's
  // register() comment on why) and only the returned role reveals what actually happened.
  // Holding the redirect back here, instead of firing it immediately like the normal success
  // path, is what gives the student a chance to actually read the warning before it's gone.
  const [wrongInstructorCode, setWrongInstructorCode] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setWrongInstructorCode(false);

    const attemptedInstructorCode = instructorCode.trim();
    const result = await register(email, password, attemptedInstructorCode || undefined);

    if (!result.ok) {
      setLoading(false);
      setMessage(result.error);
      return;
    }

    // No `user` row exists yet at this point (created on the profile page),
    // but this still loads the token into the shared context so the sidebar
    // isn't stuck showing a signed-out state on the next screen.
    await refresh();

    if (attemptedInstructorCode && result.role !== 'instructor') {
      setLoading(false);
      setWrongInstructorCode(true);
      setMessage('That instructor access code is incorrect, so your account was created as a student instead. Contact your department for the correct code if you meant to register as an instructor.');
      return;
    }

    // Registration only creates the auth user; the `user` row is created on the
    // profile page, so send new students there to finish setting up.
    router.push('/profile');
  }

  return (
    <main className="min-h-screen bg-[#0e0b1e] flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-[20px] border border-[#332b6b] bg-[#241f52] p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#FFD666] bg-[#1b1642] text-xs font-extrabold text-[#FFD666]">
            TG
          </span>
          <span className="text-lg font-extrabold text-[#FFD666]">Training Ground</span>
        </div>
        <h1 className="text-2xl font-extrabold text-[#F3F1FF]">Create your account</h1>
        <p className="mt-2 text-sm font-semibold text-[#A79FC9]">Earn points while you practice requirements engineering.</p>

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

          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete="new-password"
          />

          <button
            type="button"
            onClick={() => setShowInstructorCode((v) => !v)}
            className="text-xs font-semibold text-[#A79FC9] hover:text-[#2DD4BF] hover:underline"
          >
            Registering as an instructor?
          </button>

          {showInstructorCode ? (
            <label className="block text-sm font-bold text-[#A79FC9]">
              Instructor Access Code
              <input
                type="text"
                value={instructorCode}
                onChange={(event) => setInstructorCode(event.target.value)}
                className="mt-1 w-full rounded-[10px] border border-[#332b6b] bg-[#1b1642] px-4 py-3 text-[#F3F1FF] outline-none ring-0 transition focus:border-[#7C4DFF]"
                placeholder="Provided by your department"
              />
            </label>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#7C4DFF] px-4 py-3 font-extrabold text-white transition hover:bg-[#6234d1] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? 'Creating account…' : 'Register'}
          </button>
        </form>

        {message ? (
          <div
            className={`mt-4 rounded-xl border p-3 text-sm ${
              wrongInstructorCode ? 'border-[#FFD666]/60 bg-[#1b1642] text-[#FFD666]' : 'border-[#332b6b] bg-[#1b1642] text-[#F3F1FF]'
            }`}
          >
            <p>{message}</p>
            {wrongInstructorCode ? (
              <button
                type="button"
                onClick={() => router.push('/profile')}
                className="mt-2 font-bold text-[#2DD4BF] hover:underline"
              >
                Continue as a student
              </button>
            ) : null}
          </div>
        ) : null}

        <p className="mt-6 text-sm font-semibold text-[#A79FC9]">
          Already have an account? <Link href="/login" className="text-[#2DD4BF] hover:underline">Sign in</Link>
        </p>
        <p className="mt-2 text-sm font-semibold text-[#A79FC9]">
          Back to <Link href="/" className="text-[#2DD4BF] hover:underline">home</Link>
        </p>
      </section>
    </main>
  );
}
