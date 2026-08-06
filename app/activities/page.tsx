'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { ActivityCard, type ActivityCardData } from '../../components/ActivityCard';
import { ActivityCardSkeleton } from '../../components/ActivityCardSkeleton';
import { ACTIVITIES, Difficulty } from '../../lib/activityContent';
import { getActivityState, getTitle } from '../../lib/activityStore';
import { loadCompletedAttempts, loadSessions } from '../../lib/sessionClient';
import { useRequireRole } from '../../lib/useRequireRole';

type CardData = {
  activity: ActivityCardData;
  level: Difficulty;
  title: string;
  bestScore: { score: number; maxScore: number } | null;
  hasInProgress: boolean;
};

/**
 * The Type B "Write Acceptance Criteria" activity (GitHub #149, REQ-FU-2) — not in ACTIVITIES
 * because it has no question bank/activity_type/session_log row, but rendered by the exact same
 * ActivityCard below and run through the same getActivityState/getTitle calls as the two Type A
 * cards, so there is no per-activity special case in this page's render logic. Unlike the Type A
 * cards, its bestScore/hasInProgress can't come from loadCompletedAttempts/loadSessions — there
 * is no real activity_type or session_log row for it to query — so both stay honestly fixed
 * (null / false) until a real backend for this activity exists.
 */
const WRITE_ACCEPTANCE_CRITERIA_CARD: ActivityCardData = {
  slug: 'write-acceptance-criteria',
  name: 'Write Acceptance Criteria',
  category: 'Write Acceptance Criteria',
};

/** Every card's slug, in display order — used for the loading skeleton's placeholder count. */
const CARD_SLUGS: ActivityCardData[] = [...ACTIVITIES, WRITE_ACCEPTANCE_CRITERIA_CARD];

export default function ActivitiesPage() {
  const { token, profile, loading, authorized } = useRequireRole('student');
  const [cards, setCards] = useState<CardData[] | null>(null);
  // GitHub #108: explicit loading state rather than inferring it from cards === null — the
  // retry button needs to distinguish "haven't loaded yet" from "loaded, then failed".
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // hasInProgress comes from loadSessions('in-progress'); bestScore for each Type A activity
  // comes from loadCompletedAttempts, fetched in parallel, once per activity. level/title are
  // still derived from the localStorage mock (activityStore) — see CLAUDE.md's migration notes.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setIsLoading(true);
    setLoadFailed(false);

    const attemptsPromises = profile
      ? ACTIVITIES.map((activity) => loadCompletedAttempts(token, profile.user_id, activity.activityType))
      : ACTIVITIES.map(() => Promise.resolve({ ok: true as const, data: { attempts: [] } }));

    Promise.all([loadSessions(token, 'in-progress'), ...attemptsPromises]).then(([sessionsResult, ...attemptResults]) => {
      if (cancelled) return;

      if (!sessionsResult.ok) {
        setLoadFailed(true);
        setIsLoading(false);
        return;
      }

      const inProgressTypes = new Set(sessionsResult.data.sessions.map((session) => session.activity_type));

      const typeACards: CardData[] = ACTIVITIES.map((activity, i) => {
        const attemptsResult = attemptResults[i];
        const attempts = attemptsResult.ok ? attemptsResult.data.attempts : [];
        const best = attempts.length === 0 ? null : attempts.reduce((b, a) => (a.score > b.score ? a : b), attempts[0]);
        return {
          activity,
          level: getActivityState(activity.slug).level,
          title: getTitle(activity.slug),
          bestScore: best ? { score: best.score, maxScore: best.maxScore } : null,
          hasInProgress: inProgressTypes.has(activity.activityType),
        };
      });

      // Type B (GitHub #149, REQ-FU-2): no session_log row is ever created for this activity —
      // see app/activities/write-acceptance-criteria/page.tsx — so it can't be included in the
      // loadCompletedAttempts/inProgressTypes calls above; bestScore/hasInProgress are honestly
      // fixed rather than special-cased into those fetches. Same CardData shape as the Type A cards.
      const writeAcCard: CardData = {
        activity: WRITE_ACCEPTANCE_CRITERIA_CARD,
        level: getActivityState(WRITE_ACCEPTANCE_CRITERIA_CARD.slug).level,
        title: getTitle(WRITE_ACCEPTANCE_CRITERIA_CARD.slug),
        bestScore: null,
        hasInProgress: false,
      };

      setCards([...typeACards, writeAcCard]);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [token, profile, retryCount]);

  if (loading || !authorized) return null;

  return (
    <AppShell active="activities">
      <h3 className="mb-5 text-lg font-extrabold">Choose an activity</h3>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" role="status" aria-label="Loading activities">
          {CARD_SLUGS.map((activity) => (
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
