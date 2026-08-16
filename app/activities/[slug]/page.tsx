"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ActivityDetailSkeleton } from "../../../components/ActivityDetailSkeleton";
import { AppShell } from "../../../components/AppShell";
import { CompletedAttemptsTable } from "../../../components/CompletedAttemptsTable";
import { LevelReplaySelector } from "../../../components/LevelReplaySelector";
import { ResumeOrAbandonPrompt } from "../../../components/ResumeOrAbandonPrompt";
import { MAX_DIFFICULTY_LEVEL, nextDifficultyLevel } from "../../../lib/sessionRules";
import { useResolvedActivity } from "../../../lib/useResolvedActivity";
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

// The floor on how long ActivityDetailSkeleton stays up, regardless of how fast the current-
// session/completed-attempts fetch below actually resolves — see the loading effect's comment.
const MIN_SKELETON_MS = 400;

// Easy-to-hard reads green-to-orange, using the existing brand palette (CLAUDE.md's Styling
// Guidelines) rather than new hex values: brand-green for passing/easy, brand-danger — the
// closest existing token to orange — for the hardest level, brand-gold bridging the two. All
// three levels share the same neutral bg-white/10 pill and differ only by text color, matching
// how the category badge right next to this one is styled.
const DIFFICULTY_COLOR: Record<number, string> = {
  1: "bg-white/10 text-brand-green",
  2: "bg-white/10 text-brand-gold",
  3: "bg-white/10 text-brand-danger",
};

/** A valid 1..MAX_DIFFICULTY_LEVEL integer from the ?level= query param, or null. */
function parseLevelParam(raw: string | null): number | null {
  if (!raw) return null;
  const level = Number(raw);
  return Number.isInteger(level) && level >= 1 && level <= MAX_DIFFICULTY_LEVEL ? level : null;
}

/**
 * Split out because useSearchParams() forces the nearest Suspense boundary to render
 * client-side — without one, `npm run build` fails prerendering this route (same reason
 * app/leaderboard/page.tsx is split into a Content component this way).
 */
function ActivityDetailContent({
  params,
}: {
  params: { slug: string };
}) {
  const router = useRouter();
  // Also redirects an instructor account away (GitHub #82) — starting/resuming/abandoning a
  // quiz is exactly the "quiz durchführen" capability instructors must not have.
  const { token, profile, loading, authorized } = useRequireRole('student');
  const { activity, status: activityStatus } = useResolvedActivity(token, params.slug);

  // The level ActivityCard was already showing for this activity on the activities list page
  // (components/ActivityCard.tsx's ?level= link) — used only to seed the first paint below so
  // it doesn't default to level 1 and then jump once this page's own data has loaded; the effect
  // further down still recomputes and corrects it from real data once that arrives.
  const initialLevel = parseLevelParam(useSearchParams().get('level'));

  // The server is the only source of "does this activity have a run in progress" (REQ-PL-6.3) —
  // there is no local/mock notion of progress anymore. null means "not checked yet or nothing
  // running", which the render below treats the same as "not started".
  const [current, setCurrent] = useState<CurrentSessionResult | null>(null);
  const [attempts, setAttempts] = useState<CompletedAttempt[] | null>(null);
  // True until the current-session and completed-attempts fetches below have both resolved —
  // the hero card and level picker render nothing real before then, only ActivityDetailSkeleton,
  // so a level/status guess is never shown and then corrected once real data lands.
  const [isLoading, setIsLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  // The level picked in LevelReplaySelector — chosen ahead of time, not acted on until Start is
  // clicked. Seeded from initialLevel (the list page's own value) rather than null, so the badge
  // below reads correctly from the very first paint. null still means "nothing replayable yet"
  // once real data has loaded (no level passed, so Start uses the server's auto-advance level);
  // once a level becomes selectable there is always exactly one selected and no way to clear it
  // back to null — see the effect below and LevelReplaySelector's onSelect, which always replaces
  // the selection rather than toggling it off.
  const [selectedLevel, setSelectedLevel] = useState<number | null>(initialLevel);
  const userPickedLevelRef = useRef(false);
  const [abandoning, setAbandoning] = useState(false);
  const [error, setError] = useState<{
    message: string;
    needsProfile: boolean;
  } | null>(null);

  // The highest difficulty level passed so far, derived from the same completed-attempts list
  // the history table below already renders — no separate fetch needed. 0 means "nothing passed
  // yet," which LevelReplaySelector reads as "nothing to replay."
  const highestPassedLevel = attempts
    ? Math.max(0, ...attempts.filter((attempt) => attempt.passed).map((attempt) => attempt.difficultyLevel))
    : 0;
  // The top of the selectable range: every already-passed level, plus the one level beyond that
  // Start would auto-advance to anyway (POST /api/sessions accepts a replay override up to and
  // including this exact value — see that route's comment). Always >= 1: a student who hasn't
  // passed anything yet still has level 1 to show and select (nextDifficultyLevel(null) ===
  // START_DIFFICULTY_LEVEL), so the selector is never hidden just because nothing's been passed.
  const highestSelectableLevel = nextDifficultyLevel(highestPassedLevel >= 1 ? highestPassedLevel : null);

  // The next level (one past whatever was last passed) is the default selection — right after
  // finishing a level, that's what's shown pre-selected; for a student with nothing passed yet,
  // that's level 1. Gated on attempts !== null rather than highestPassedLevel >= 1 — attempts
  // starting null (not yet loaded) must not itself count as "confirmed nothing passed" and stomp
  // initialLevel (the query-param guess) with a premature "level 1" before the real fetch lands.
  // userPickedLevelRef means this only ever sets the default itself; it never re-asserts itself
  // over a level the student has since picked.
  useEffect(() => {
    if (!userPickedLevelRef.current && attempts !== null) {
      setSelectedLevel(highestSelectableLevel);
    }
  }, [attempts, highestSelectableLevel]);

  // Both reads in one pass, because the page re-runs this on every return from /play: the
  // running session decides Start vs. Resume/Abandon, the finished ones fill the history below.
  useEffect(() => {
    if (!token || !activity || !profile?.user_id) {
      // Nothing to fetch yet (still resolving auth, or no profile row — see handleStart's 409
      // handling) — there is no load in flight to wait on, so don't leave the skeleton spinning
      // forever; the page renders its normal empty/default state instead.
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    let minDelayTimeout: ReturnType<typeof setTimeout> | undefined;
    const fetchStartedAt = Date.now();

    Promise.all([
      loadCurrentSession(token, activity.activityType),
      // forceRefresh, not the cache-first default: highestSelectableLevel below (and therefore
      // how many buttons LevelReplaySelector renders) is derived straight from attempts, so a
      // stale cache hit here doesn't just show a stale *value* — it changes the button row's
      // *shape*, then pops in extra buttons once the background revalidation lands seconds
      // later, disagreeing with the badge in the meantime (that one reads selectedLevel, seeded
      // from the ?level= query param, independent of attempts). Forcing a real fetch means
      // attempts is already correct by the time isLoading flips false, so there's nothing left to
      // pop in. See loadCompletedAttempts's own docblock (lib/sessionClient.ts) for the general
      // cache-first/onRevalidate mechanism — still the right choice for callers like
      // app/activities/page.tsx's cards, just not for a control whose shape depends on this data.
      loadCompletedAttempts(token, profile.user_id, activity.activityType, { forceRefresh: true }),
    ]).then(([currentResult, completed]) => {
      if (cancelled) return;
      if (currentResult.ok) setCurrent(currentResult.data);
      // An empty list and a failed read are different things, so the history only
      // renders once it is actually known — null keeps it out of the way until then.
      if (completed.ok) setAttempts(completed.data.attempts);

      // Both loadCurrentSession and loadCompletedAttempts can resolve inside a single frame on a
      // fast/local connection, so the skeleton would otherwise never actually get painted before
      // real content replaces it (no animation is "not played" so much as never shown at all).
      // Floor the loading state at MIN_SKELETON_MS so the transition reads the same as a fresh
      // navigation into this page from the activities list, where the fetch is slow enough to
      // make the skeleton visible on its own.
      const elapsed = Date.now() - fetchStartedAt;
      if (elapsed >= MIN_SKELETON_MS) {
        setIsLoading(false);
      } else {
        minDelayTimeout = setTimeout(() => {
          if (!cancelled) setIsLoading(false);
        }, MIN_SKELETON_MS - elapsed);
      }
    });

    return () => {
      cancelled = true;
      if (minDelayTimeout) clearTimeout(minDelayTimeout);
    };
  }, [token, activity, profile?.user_id]);

  if (loading || !authorized) return null;

  // 'loading' here means useResolvedActivity is still checking the server for a slug that isn't
  // one of the three built-ins — same "nothing real yet" reasoning as the isLoading skeleton
  // below, just for a fetch that has to resolve before it's even known whether this activity
  // exists at all.
  if (activityStatus === 'loading') return null;

  if (!activity) {
    return (
      <AppShell active="activities">
        <div className="mx-auto max-w-lg">
          <Link
            href="/activities"
            className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-[#1B1642]"
          >
            ← Back to Activities
          </Link>
          <p className="rounded-2xl border border-brand-danger/40 bg-brand-danger/10 p-6 text-sm font-semibold text-brand-danger-light">
            {activityStatus === 'forbidden'
              ? "You're not enrolled in a course that offers this activity."
              : "This activity doesn't exist."}
          </p>
        </div>
      </AppShell>
    );
  }

  // Starts at selectedLevel when one has been picked via LevelReplaySelector, otherwise the
  // server's auto-advance level (undefined difficultyLevel) — Start is the only thing that ever
  // triggers the actual POST; selecting a level just sets what Start will use.
  async function handleStart() {
    if (!token || starting) return;

    setStarting(true);
    setError(null);

    const result = await startSession(token, activity!.activityType, { difficultyLevel: selectedLevel ?? undefined });

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
  // Before a session exists, show whatever level Start would actually use: the replay level the
  // student picked, if any, else highestSelectableLevel — never START_DIFFICULTY_LEVEL here.
  // selectedLevel only gets seeded to highestSelectableLevel by the effect above once attempts
  // has loaded, and that effect runs a render *after* the one where isLoading first flips false
  // (React batches setAttempts/setIsLoading together, but effects run post-commit) — on a hard
  // refresh with no ?level= to seed initialLevel, that gap showed a wrong "Level 1" badge for one
  // frame right after the loading skeleton. highestSelectableLevel is derived straight from
  // attempts on every render, so falling back to it instead has no such lag, and degrades to the
  // exact same value (START_DIFFICULTY_LEVEL) once selectedLevel is genuinely unset with nothing
  // passed yet.
  const displayLevel = session?.difficulty_level ?? selectedLevel ?? highestSelectableLevel;

  return (
    <AppShell active="activities">
      <div className="mx-auto max-w-lg">
        <Link
          href="/activities"
          className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-[#1B1642]"
        >
          ← Back to Activities
        </Link>

        {isLoading ? (
          <ActivityDetailSkeleton />
        ) : (
          <>
            <div className="rounded-2xl border border-[#332b6b] bg-[#1b1642] p-8 text-[#F3F1FF]">
              <div className="mb-4 flex flex-wrap gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${DIFFICULTY_COLOR[displayLevel] ?? "bg-white/10 text-brand-teal"}`}>
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

              {!session ? (
                <LevelReplaySelector
                  highestSelectableLevel={highestSelectableLevel}
                  selectedLevel={selectedLevel}
                  // A level, once replayable, is always selected — clicking a button switches the
                  // selection, it never clears it back to auto-advance.
                  onSelect={(level) => {
                    userPickedLevelRef.current = true;
                    setSelectedLevel(level);
                  }}
                  disabled={starting}
                />
              ) : null}
            </div>

            <CompletedAttemptsTable attempts={attempts} />
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function ActivityDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  return (
    <Suspense fallback={null}>
      <ActivityDetailContent params={params} />
    </Suspense>
  );
}
