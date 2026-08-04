'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { ActivityCard } from '../../components/ActivityCard';
import { ActivityCardSkeleton } from '../../components/ActivityCardSkeleton';
import { ACTIVITIES, ActivityDefinition, Difficulty } from '../../lib/activityContent';
import { getActivityState, getBestScore, getTitle } from '../../lib/activityStore';
import { loadSessions } from '../../lib/sessionClient';
import { useRequireRole } from '../../lib/useRequireRole';

type CardData = {
  activity: ActivityDefinition;
  level: Difficulty;
  title: string;
  bestScore: { score: number; maxScore: number } | null;
  hasInProgress: boolean;
};

export default function ActivitiesPage() {
  const { token, loading, authorized } = useRequireRole('student');
  const [cards, setCards] = useState<CardData[] | null>(null);
  // GitHub #108: explicit loading state rather than inferring it from cards === null — the
  // retry button needs to distinguish "haven't loaded yet" from "loaded, then failed".
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // hasInProgress comes from the real session API (REQ-PL-6.3 must hold for every activity,
  // not just whichever one the mock happened to remember) — one list covers every card, rather
  // than a per-activity round trip. level/title/bestScore are still mock-derived; see CLAUDE.md's
  // migration notes for what's left to wire up there.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setIsLoading(true);
    setLoadFailed(false);

    loadSessions(token, 'in-progress').then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        setLoadFailed(true);
        setIsLoading(false);
        return;
      }

      const inProgressTypes = new Set(result.data.sessions.map((session) => session.activity_type));

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
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [token, retryCount]);

  if (loading || !authorized) return null;

  return (
    <AppShell active="activities">
      <h3 className="mb-5 text-lg font-extrabold">Choose an activity</h3>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" role="status" aria-label="Loading activities">
          {ACTIVITIES.map((activity) => (
            <ActivityCardSkeleton key={activity.slug} />
          ))}
        </div>
      ) : loadFailed ? (
        <div className="rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-center">
          <p className="mb-4 text-sm font-semibold text-brand-danger">Failed to load activities.</p>
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
          >
            Retry
          </button>
        </div>
      ) : (
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
      )}
    </AppShell>
  );
}
