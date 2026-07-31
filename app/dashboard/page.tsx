"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { ACTIVITIES, Difficulty } from "../../lib/activityContent";
import {
  ActivityState,
  getActivityState,
  getRecentHistory,
  RecentEntry,
} from "../../lib/activityStore";
import { useUser } from "../../components/UserProvider";

type ContinueTarget = {
  slug: string;
  name: string;
  level: Difficulty;
  answered: number;
  total: number;
};

export default function DashboardPage() {
  const { token, profile, loading } = useUser();
  const [statesBySlug, setStatesBySlug] = useState<Record<
    string,
    ActivityState
  > | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  useEffect(() => {
    if (!token) return;
    const entries: Record<string, ActivityState> = {};
    for (const activity of ACTIVITIES) {
      entries[activity.slug] = getActivityState(activity.slug);
    }
    setStatesBySlug(entries);
    setRecent(getRecentHistory(3));
  }, [token]);

  if (loading) return null;

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0e0b1e] px-6 text-center text-[#F3F1FF]">
        <div>
          <p className="mb-4">You must be logged in to view your dashboard.</p>
          <Link
            href="/login"
            className="rounded-full bg-[#7C4DFF] px-4 py-2 text-sm font-bold text-white"
          >
            Go to login
          </Link>
        </div>
      </main>
    );
  }

  const continueTarget: ContinueTarget | null = (() => {
    if (!statesBySlug) return null;
    for (const activity of ACTIVITIES) {
      const state = statesBySlug[activity.slug];
      if (state?.inProgress) {
        return {
          slug: activity.slug,
          name: activity.name,
          level: state.inProgress.level,
          answered: state.inProgress.answeredIds.length,
          total: state.inProgress.questionIds.length,
        };
      }
    }
    return null;
  })();

  const rightbar = (
    <>
      <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold text-white">
        Recent activity
      </h3>
      {recent.length === 0 ? (
        <p className="text-sm font-semibold text-[#A79FC9]">
          No completed attempts yet — finish a round to see it here.
        </p>
      ) : (
        <div className="relative mb-4 pl-6">
          <span className="absolute bottom-1.5 left-[11px] top-1.5 w-px bg-[#332b6b]" />
          {recent.map((entry, i) => (
            <div key={i} className="relative mb-5 last:mb-0">
              <span
                className={`absolute -left-6 top-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#1b1642] text-xs ${
                  entry.passed
                    ? "bg-[#2DD4BF] text-[#04241f]"
                    : "bg-[#7C4DFF] text-white"
                }`}
              >
                {entry.passed ? "✓" : "•"}
              </span>
              <div className="text-sm font-bold leading-tight text-white">
                {entry.activityName} · Level {entry.level}
              </div>
              <div className="mt-0.5 text-xs font-semibold text-[#A79FC9]">
                {new Date(entry.completedAt).toLocaleDateString()} ·{" "}
                {entry.score}/{entry.maxScore}
              </div>
            </div>
          ))}
        </div>
      )}
      <span className="block w-full cursor-default rounded-[10px] border border-[#2DD4BF]/40 py-2.5 text-center text-sm font-extrabold text-[#2DD4BF]/60">
        View Full Log
      </span>
    </>
  );

  return (
    <AppShell active="dashboard" rightbar={rightbar}>
      <div className="dash-hero-wrap relative mb-2 inline-block rounded-2xl bg-[#1b1642] px-5 py-3">
        <h2
          className={`dash-hero relative inline-block text-3xl font-extrabold leading-tight transition-opacity duration-300 ${loading ? "opacity-0" : "opacity-100"}`}
        >
          Welcome back{profile?.username ? `, ${profile.username}` : ""}!
        </h2>
        <span
          className="dash-sparkle"
          style={{ top: "4px", left: "3%", animationDelay: "0s" }}
        />
        <span
          className="dash-sparkle"
          style={{ top: "65%", left: "93%", animationDelay: ".9s" }}
        />
        <span
          className="dash-sparkle"
          style={{ top: "18%", left: "55%", animationDelay: "1.6s" }}
        />
        <span
          className="dash-sparkle"
          style={{ top: "75%", left: "14%", animationDelay: "2.3s" }}
        />
        <style jsx>{`
          .dash-hero-wrap {
            box-shadow: 0 0 40px -12px rgba(139, 92, 246, 0.45);
          }
          .dash-hero {
            background-image: linear-gradient(
              90deg,
              #a78bfa,
              #f472b6,
              #22d3ee,
              #a78bfa
            );
            background-size: 300% auto;
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            color: transparent;
            text-shadow:
              0 0 18px rgba(167, 139, 250, 0.55),
              0 0 32px rgba(244, 114, 182, 0.4),
              0 0 46px rgba(34, 211, 238, 0.35);
            animation: dash-hero-flow 6s ease-in-out infinite;
          }
          @keyframes dash-hero-flow {
            0%,
            100% {
              background-position: 0% 50%;
            }
            50% {
              background-position: 100% 50%;
            }
          }
          .dash-sparkle {
            position: absolute;
            width: 6px;
            height: 6px;
            border-radius: 9999px;
            background: radial-gradient(
              circle,
              #ffffff 0%,
              rgba(255, 255, 255, 0) 70%
            );
            animation: dash-sparkle-twinkle 2.6s ease-in-out infinite;
            pointer-events: none;
          }
          @keyframes dash-sparkle-twinkle {
            0%,
            100% {
              opacity: 0;
              transform: scale(0.4);
            }
            50% {
              opacity: 1;
              transform: scale(1);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .dash-hero {
              animation: none;
              background-position: 30% 50%;
            }
            .dash-sparkle {
              animation: none;
              opacity: 0.5;
            }
          }
        `}</style>
      </div>
      <p className="mb-7 max-w-md text-sm font-semibold text-gray-500">
        Ready to keep sharpening your requirements-engineering instincts? Pick
        up where you left off or start something new.
      </p>

      {continueTarget ? (
        <div className="mb-7 flex flex-col gap-5 rounded-2xl bg-[#1b1642] p-6 text-[#F3F1FF] sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[#FFD666]">
              In progress
            </div>
            <h3 className="mb-2 text-xl font-extrabold text-white">
              {continueTarget.name}
            </h3>
            <p className="mb-4 text-sm font-semibold text-[#A79FC9]">
              Level {continueTarget.level} · question {continueTarget.answered}{" "}
              of {continueTarget.total} answered
            </p>
            <Link
              href={`/activities/${continueTarget.slug}`}
              className="inline-block rounded-[10px] bg-[#7C4DFF] px-5 py-2.5 text-sm font-extrabold text-white hover:bg-[#6234d1]"
            >
              Resume
            </Link>
          </div>
        </div>
      ) : (
        <div className="mb-7 rounded-2xl bg-[#1b1642] p-6 text-[#F3F1FF]">
          <h3 className="mb-2 text-xl font-extrabold text-white">
            No activity in progress
          </h3>
          <p className="mb-4 text-sm font-semibold text-[#A79FC9]">
            Head to Activities to start practicing.
          </p>
          <Link
            href="/activities"
            className="inline-block rounded-[10px] bg-[#7C4DFF] px-5 py-2.5 text-sm font-extrabold text-white hover:bg-[#6234d1]"
          >
            Browse Activities
          </Link>
        </div>
      )}

      <h3 className="mb-4 text-lg font-extrabold text-[#1B1642]">
        Mastery titles
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ACTIVITIES.map((activity) => {
          const state = statesBySlug?.[activity.slug];
          const passedLevels =
            state?.history.filter((h) => h.passed).map((h) => h.level) ?? [];
          const highest =
            passedLevels.length > 0
              ? (Math.max(...passedLevels) as Difficulty)
              : null;
          return (
            <div
              key={activity.slug}
              className="rounded-2xl border border-gray-100 bg-gray-50 p-4"
            >
              <p className="mb-3 text-sm font-extrabold text-[#1B1642]">
                {activity.name}
              </p>
              <div className="flex flex-col gap-2">
                {([1, 2, 3] as Difficulty[]).map((level) => {
                  const earned = highest !== null && level <= highest;
                  const isCurrent = level === highest;
                  return (
                    <div
                      key={level}
                      className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${
                        isCurrent ? "bg-[#7C4DFF] text-white" : "bg-white"
                      }`}
                    >
                      <div>
                        <div
                          className={`text-sm font-extrabold ${isCurrent ? "text-white" : "text-[#1B1642]"}`}
                        >
                          {activity.titles[level]}
                        </div>
                        {!earned ? (
                          <div className="text-xs font-semibold text-gray-400">
                            Reach level {level} with 80%+
                          </div>
                        ) : null}
                      </div>
                      {earned ? (
                        <span
                          className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs ${
                            isCurrent
                              ? "bg-white/25 text-white"
                              : "bg-[#2DD4BF]/20 text-[#0f7d70]"
                          }`}
                        >
                          ✓
                        </span>
                      ) : (
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5 flex-none text-gray-300"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <rect x="5" y="11" width="14" height="9" rx="2" />
                          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                        </svg>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
