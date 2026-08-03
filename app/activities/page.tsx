'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { ActivityCard } from '../../components/ActivityCard';
import { ACTIVITIES, ActivityDefinition, Difficulty } from '../../lib/activityContent';
import { getActivityState, getBestScore, getTitle } from '../../lib/activityStore';
import { loadSessions } from '../../lib/sessionClient';
import { useAccessToken } from '../../lib/useAccessToken';

type CardData = {
  activity: ActivityDefinition;
  level: Difficulty;
  title: string;
  bestScore: { score: number; maxScore: number } | null;
  hasInProgress: boolean;
};

export default function ActivitiesPage() {
  const router = useRouter();
  const { token, loading } = useAccessToken();
  const [cards, setCards] = useState<CardData[] | null>(null);

  // No session, and we're done checking: send the user to a real "logged out"
  // screen instead of leaving the activities list mounted with nothing to show.
  useEffect(() => {
    if (!loading && !token) router.replace('/login');
  }, [loading, token, router]);

  // hasInProgress comes from the real session API (REQ-PL-6.3 must hold for every activity,
  // not just whichever one the mock happened to remember) — one list covers every card, rather
  // than a per-activity round trip. level/title/bestScore are still mock-derived; see CLAUDE.md's
  // migration notes for what's left to wire up there.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    loadSessions(token, 'in-progress').then((result) => {
      if (cancelled) return;

      const inProgressTypes = new Set(
        result.ok ? result.data.sessions.map((session) => session.activity_type) : [],
      );

      setCards(
        ACTIVITIES.map((activity) => {
          const state = getActivityState(activity.slug);
          return {
            activity,
            level: state.level,
            title: getTitle(activity.slug),
            bestScore: getBestScore(activity.slug),
            hasInProgress: inProgressTypes.has(activity.activityType),
          };
        }),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) return null;

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0e0b1e] px-6 text-center text-[#F3F1FF]">
        <div>
          <p className="mb-4">You must be logged in to view activities.</p>
          <Link href="/login" className="rounded-full bg-[#7C4DFF] px-4 py-2 text-sm font-bold text-white">
            Go to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <AppShell active="activities">
      <h3 className="mb-5 text-lg font-extrabold">Choose an activity</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards?.map((card) => (
          <ActivityCard
            key={card.activity.slug}
            activity={card.activity}
            level={card.level}
            title={card.title}
            bestScore={card.bestScore}
            hasInProgress={card.hasInProgress}
          />
        ))}
      </div>
    </AppShell>
  );
}
