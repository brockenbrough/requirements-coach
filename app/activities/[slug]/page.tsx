"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/AppShell";
import { CompletedAttemptsTable } from "../../../components/CompletedAttemptsTable";
import { ResumeOrAbandonPrompt } from "../../../components/ResumeOrAbandonPrompt";
import { getActivity } from "../../../lib/activityContent";
import { START_DIFFICULTY_LEVEL } from "../../../lib/sessionRules";
import {
  type CompletedAttempt,
  type CurrentSessionResult,
  abandonSession,
  loadActivityLog,
  loadCompletedAttempts,
  loadCurrentSession,
  startSession,
} from "../../../lib/sessionClient";
import { useRequireRole } from "../../../lib/useRequireRole";

const DIFFICULTY_LABEL: Record<number, string> = {
  1: "Easy",
  2: "Medium",
  3: "Hard",
};

export default function ActivityDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const router = useRouter();
  // Also redirects an instructor account away (GitHub #82) — starting/resuming/abandoning a
  // quiz is exactly the "quiz durchführen" capability instructors must not have.
  const { token, profile, loading, authorized } = useRequireRole('student');
  const activity = getActivity(params.slug);

  // The server is the only source of "does this activity have a run in progress" (REQ-PL-6.3) —
  // there is no local/mock notion of progress anymore. null means "not checked yet or nothing
  // running", which the render below treats the same as "not started".
  const [current, setCurrent] = useState<CurrentSessionResult | null>(null);
  const [attempts, setAttempts] = useState<CompletedAttempt[] | null>(null);
  const [starting, setStarting] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [error, setError] = useState<{
    message: string;
    needsProfile: boolean;
  } | null>(null);

  // Both reads in one pass, because the page re-runs this on every return from /play: the
  // running session decides Start vs. Resume/Abandon, the finished ones fill the history below.
  useEffect(() => {
    if (!token || !activity || !profile?.user_id) return;
    let cancelled = false;

    Promise.all([
      loadCurrentSession(token, activity.activityType),
      loadCompletedAttempts(token, profile.user_id, activity.activityType),
    ]).then(([currentResult, completed]) => {
      if (cancelled) return;
      if (currentResult.ok) setCurrent(currentResult.data);
      // An empty list and a failed read are different things, so the history only
      // renders once it is actually known — null keeps it out of the way until then.
      if (completed.ok) setAttempts(completed.data.attempts);
    });

    return () => {
      cancelled = true;
    };
  }, [token, activity, profile?.user_id]);

  // Type B activities (e.g. write-acceptance-criteria) have their own dedicated page under
  // the same path. The static Next.js route normally wins, but guard here in case the dynamic
  // segment is somehow matched — redirect rather than showing "Unknown activity."
  useEffect(() => {
    if (!loading && authorized && !activity) {
      router.replace(`/activities/${params.slug}`);
    }
  }, [loading, authorized, activity, params.slug, router]);

  if (loading || !authorized) return null;

  if (!activity) {
    return null;
  }

  async function handleStart() {
    if (!token || starting) return;

    setStarting(true);
    setError(null);

    const result = await startSession(token, activity!.activityType);

    if (result.ok) {
      // A fresh (or resumed) session now shows up in the activity log too.
      if (profile?.user_id) {
        void loadActivityLog(token, profile.user_id, { forceRefresh: true });
      }
      router.push(`/activities/${activity!.slug}/play`);
      return;
    }

    setStarting(false);

    if (result.status === 401) {
      router.push("/login");
      return;
    }

    // 409: authenticated, but no row in "user" yet — registration does not create one,
    // and session_log.user_id references it.
    setError({ message: result.error, needsProfile: result.status === 409 });
  }

  function handleResume() {
    // The whole point of a running session is that it is already in hand server-side —
    // resuming is just navigating there, not another start/resume network round trip.
    router.push(`/activities/${activity!.slug}/play`);
  }

  async function handleAbandon() {
    // Confirmation now lives in ResumeOrAbandonPrompt (GitHub #260) — onAbandon only fires
    // after the student has already confirmed, so this is just the actual abandon call.
    const session = current?.session;
    if (!token || !session || abandoning) return;

    setAbandoning(true);
    setError(null);

    const result = await abandonSession(token, session.session_id);

    setAbandoning(false);

    if (!result.ok) {
      if (result.status === 401) {
        router.push("/login");
        return;
      }
      // 409: the session already left in-progress by some other route (finished, or already
      // abandoned elsewhere) — treat it the same as a successful abandon rather than reporting
      // a conflict the student cannot act on.
      if (result.status === 409) {
        setCurrent(null);
        return;
      }
      setError({ message: result.error, needsProfile: false });
      return;
    }

    // The abandoned session's status just changed — the activity log's cached copy hasn't.
    if (profile?.user_id) {
      void loadActivityLog(token, profile.user_id, { forceRefresh: true });
    }
    setCurrent(null);
  }

  const session = current?.session ?? null;
  const totalQuestions = current?.questions.length ?? 0;
  const answeredCount = current?.answers.length ?? 0;
  // Every new session is currently drawn at START_DIFFICULTY_LEVEL (see POST /api/sessions) —
  // real level progression isn't implemented server-side yet, so this always matches what
  // clicking Start would actually produce, and the running session's own level once one exists.
  const displayLevel = session?.difficulty_level ?? START_DIFFICULTY_LEVEL;

  return (
    <AppShell active="activities">
      <div className="mx-auto max-w-lg">
        <Link
          href="/activities"
          className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-[#1B1642]"
        >
          ← Back to Activities
        </Link>

        <div className="rounded-2xl border border-[#332b6b] bg-[#1b1642] p-8 text-[#F3F1FF]">
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-extrabold text-[#2DD4BF]">
              {DIFFICULTY_LABEL[displayLevel] ?? "Level"} · Level {displayLevel}
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-[#A79FC9]">
              {activity.category}
            </span>
          </div>
          <h2 className="mb-2 text-2xl font-extrabold text-white">
            {activity.name}
          </h2>
          <p className="mb-6 text-sm font-semibold text-[#A79FC9]">
            {activity.instructions}
          </p>

          {session ? (
            <ResumeOrAbandonPrompt
              message="You have a previous attempt in progress."
              progressLabel={`${answeredCount} / ${totalQuestions} answered`}
              progressFraction={totalQuestions > 0 ? answeredCount / totalQuestions : 0}
              onResume={handleResume}
              onAbandon={handleAbandon}
              abandoning={abandoning}
              confirmMessage="Abandon this in-progress attempt? Your answers so far will be discarded."
            />
          ) : (
            <button
              onClick={handleStart}
              disabled={starting}
              className="rounded-full bg-[#7C4DFF] px-6 py-3 text-sm font-extrabold text-white hover:bg-[#6234d1] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {starting ? "Starting…" : "Start"}
            </button>
          )}

          {error ? (
            <div className="mt-4 rounded-brand-md border border-brand-danger/40 bg-brand-danger/10 p-4 text-sm font-semibold text-brand-danger-light">
              {error.message}
              {error.needsProfile ? (
                <Link
                  href="/profile"
                  className="ml-1 underline hover:text-white"
                >
                  Go to your profile
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        <CompletedAttemptsTable attempts={attempts} />
      </div>
    </AppShell>
  );
}
