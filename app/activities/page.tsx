'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { ActivityCard } from '../../components/ActivityCard';
import { ACTIVITIES, ActivityDefinition, Difficulty } from '../../lib/activityContent';
import { getActivityState, getBestScore, getTitle } from '../../lib/activityStore';
import { useAccessToken } from '../../lib/useAccessToken';

type CardData = {
  activity: ActivityDefinition;
  level: Difficulty;
  title: string;
  bestScore: { score: number; maxScore: number } | null;
  hasInProgress: boolean;
};

export default function ActivitiesPage() {
  const { token, loading } = useAccessToken();
  const [cards, setCards] = useState<CardData[] | null>(null);

  useEffect(() => {
    if (!token) return;
    setCards(
      ACTIVITIES.map((activity) => {
        const state = getActivityState(activity.slug);
        return {
          activity,
          level: state.level,
          title: getTitle(activity.slug),
          bestScore: getBestScore(activity.slug),
          hasInProgress: state.inProgress !== null,
        };
      })
    );
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
