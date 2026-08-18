'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { FeedbackCard } from '../../components/FeedbackCard';
import { QuestionCard } from '../../components/QuestionCard';
import { loadDailyChallenge, startDailyChallenge, submitDailyChallengeAnswer } from '../../lib/dailyChallengeClient';
import type { DailyChallengeState } from '../../lib/dailyChallengeTypes';
import { toInstant } from '../../lib/dateTime';
import { useRequireRole } from '../../lib/useRequireRole';

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Lets a student leave the challenge screen from any state, including mid-attempt — safe to do
 * since there's no "abandon" for the Daily Challenge: the deadline keeps counting down
 * server-side regardless of whether this page is open, and loadDailyChallenge picks the attempt
 * back up on return.
 *
 * Carries its own background/border rather than relying on surrounding text color, since it
 * renders both on AppShell's white <main> (the in-progress and completed states have no
 * wrapping card) and on this page's own dark cards (bg-[#1b1642]) — a plain light-on-transparent
 * link had good contrast on the dark cards but nearly none on white.
 */
function BackToDashboardLink() {
  return (
    <Link
      href="/dashboard"
      className="mb-4 inline-flex items-center gap-1.5 rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3 py-1.5 text-xs font-extrabold text-white transition hover:bg-brand-navy"
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3 flex-none" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 6l-6 6 6 6" />
      </svg>
      Back to dashboard
    </Link>
  );
}

/**
 * The Daily Challenge attempt screen (GitHub #336) — landing/in-progress/expired/completed all
 * live on this one route, unlike the Type A activities/play split, since there is no
 * difficulty-level choice or multi-question setup to show first: a single question either is or
 * isn't running.
 */
export default function DailyChallengePage() {
  const router = useRouter();
  const { token, loading, authorized } = useRequireRole('student');

  const [state, setState] = useState<DailyChallengeState | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const result = await loadDailyChallenge(token);
    if (!result.ok) {
      if (result.status === 401) {
        router.replace('/login');
        return;
      }
      setError(result.error);
      return;
    }
    setState(result.data);
  }, [token, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Ticks every second while an attempt is running and unsubmitted, computed from deadline_at via
  // toInstant — the same UTC-pinning lib/dailyChallengeRules.ts's server-side isExpired uses, so
  // the display and the enforcement can't disagree about what the timestamp means. Re-fetches from
  // the server on hitting zero rather than flipping a local "expired" flag: the server is the only
  // side that actually knows whether the deadline has passed.
  useEffect(() => {
    if (!state?.attempt || state.attempt.submitted_at || state.expired) {
      setRemainingMs(null);
      return;
    }

    const deadline = new Date(toInstant(state.attempt.deadline_at)).getTime();
    let cancelled = false;

    function tick() {
      const remaining = deadline - Date.now();
      if (cancelled) return;
      setRemainingMs(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(interval);
        void refresh();
      }
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [state?.attempt, state?.expired, refresh]);

  if (loading || !authorized) return null;

  async function handleStart() {
    if (!token || starting) return;
    setStarting(true);
    const result = await startDailyChallenge(token);
    setStarting(false);

    if (!result.ok) {
      if (result.status === 401) {
        router.replace('/login');
        return;
      }
      setError(result.error);
      return;
    }
    setState(result.data);
  }

  async function handleSubmit(selectedOptionId: string) {
    if (!token || submitting || !state?.attempt) return;
    setSubmitting(true);
    const result = await submitDailyChallengeAnswer(token, state.attempt.daily_challenge_attempt_id, selectedOptionId);
    setSubmitting(false);

    if (!result.ok) {
      if (result.status === 401) {
        router.replace('/login');
        return;
      }
      // 409: already submitted (another tab/device), or the deadline passed between the last
      // tick and this click — the server's version wins either way, so re-read instead of
      // reporting a conflict the student cannot act on.
      if (result.status === 409) {
        await refresh();
        return;
      }
      setError(result.error);
      return;
    }

    // The response already carries everything the completed view needs — no second round trip.
    setState((current) =>
      current
        ? {
            ...current,
            attempt: result.data.attempt,
            correct: result.data.correct,
            score: result.data.score,
            explanation: result.data.explanation,
          }
        : current,
    );
  }

  if (error) {
    return (
      <AppShell active="dashboard">
        <div className="mx-auto max-w-xl rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-sm font-semibold text-brand-danger-light">
          {error}
          <Link href="/dashboard" className="ml-1 underline hover:text-white">
            Back to the dashboard
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell active="dashboard">
      <div className="mx-auto max-w-xl">
        {state === null ? (
          <p className="text-sm font-semibold text-gray-500">Loading today’s challenge…</p>
        ) : !state.attempt ? (
          !state.available ? (
            <div className="rounded-2xl border border-[#332b6b] bg-[#1b1642] p-6 text-[#F3F1FF]">
              <BackToDashboardLink />
              <h2 className="mb-2 text-xl font-extrabold text-white">No Daily Challenge yet</h2>
              <p className="mb-4 text-sm font-semibold text-[#A79FC9]">
                Join a course to unlock a daily bonus question drawn from its question bank.
              </p>
              <Link
                href="/courses"
                className="inline-block rounded-[10px] bg-[#7C4DFF] px-5 py-2.5 text-sm font-extrabold text-white hover:bg-[#6234d1]"
              >
                Browse courses
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#332b6b] bg-[#1b1642] p-6 text-[#F3F1FF]">
              <BackToDashboardLink />
              <h2 className="mb-2 text-xl font-extrabold text-white">Today’s Daily Challenge</h2>
              <p className="mb-4 text-sm font-semibold text-[#A79FC9]">
                One question, double points, under a time limit. The clock starts the moment you begin.
              </p>
              <button
                type="button"
                onClick={handleStart}
                disabled={starting}
                className="rounded-[10px] bg-[#7C4DFF] px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#6234d1] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {starting ? 'Starting…' : 'Start Daily Challenge'}
              </button>
            </div>
          )
        ) : state.attempt.submitted_at ? (
          <>
            <BackToDashboardLink />
            {state.question ? (
              <FeedbackCard
                prompt={state.question.question_prompt}
                options={state.question.options}
                selectedAnswerId={state.attempt.submitted_option ?? ''}
                correctAnswerId={
                  state.question.options.find((option) => option.is_correct)?.answer_id ??
                  state.attempt.submitted_option ??
                  ''
                }
                selectedExplanation={state.explanation ?? null}
                correctExplanation={
                  state.correct ? null : state.question.options.find((option) => option.is_correct)?.explanation ?? null
                }
                awardedScore={state.score ?? 0}
                isCorrect={!!state.correct}
              />
            ) : null}
            <p className="mt-5 text-center text-sm font-semibold text-gray-500">
              That’s today’s Daily Challenge — come back tomorrow for another one.
            </p>
          </>
        ) : state.expired ? (
          <div className="rounded-2xl border border-[#332b6b] bg-[#1b1642] p-6 text-[#F3F1FF]">
            <h2 className="mb-2 text-xl font-extrabold text-white">Time’s up</h2>
            <p className="mb-4 text-sm font-semibold text-[#A79FC9]">
              Today’s attempt has closed. Come back tomorrow for a new question.
            </p>
            <Link
              href="/dashboard"
              className="inline-block rounded-[10px] bg-[#7C4DFF] px-5 py-2.5 text-sm font-extrabold text-white hover:bg-[#6234d1]"
            >
              Back to dashboard
            </Link>
          </div>
        ) : (
          <>
            <BackToDashboardLink />
            <div className="mb-5 flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wide text-[#FFD666]">Daily Challenge · 2x points</span>
              <span className="rounded-full bg-[#241f52] px-3 py-1 text-sm font-extrabold text-white">
                {remainingMs === null ? '…' : formatRemaining(remainingMs)}
              </span>
            </div>
            {state.question ? <QuestionCard question={state.question} disabled={submitting} onSubmit={handleSubmit} /> : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
