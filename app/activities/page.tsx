'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { ActivityCard, type ActivityCardData } from '../../components/ActivityCard';
import { ActivityCardSkeleton } from '../../components/ActivityCardSkeleton';
import { answeredCount, getStoredSession, isSessionComplete, STORIES_PER_SESSION } from '../../lib/acceptanceCriteriaSessionStore';
import { deriveActivityCardStatus, type ActivityCardStatus } from '../../lib/activityCardStatus';
import { ACTIVITIES, Difficulty } from '../../lib/activityContent';
import { loadCompletedAttempts, loadSessions, loadStudentTitles, type StudentTitle } from '../../lib/sessionClient';
import { START_DIFFICULTY_LEVEL } from '../../lib/sessionRules';
import { useRequireRole } from '../../lib/useRequireRole';

type CardData = {
  activity: ActivityCardData;
  /** The activity_type this card's title is looked up by; null for Type B, which has none. */
  activityType: string | null;
  level: Difficulty;
  status: ActivityCardStatus;
};

/**
 * The student's earned title for one activity, or null when they haven't passed a level yet.
 *
 * Keyed off difficultyLevel rather than the title string: GET /api/students/{id}/titles fills
 * `title` with the literal "Not yet started" for an attempted-but-never-passed activity
 * (lib/titleQueries.ts), and rendering that next to a real score is exactly what GitHub #272
 * reported. difficultyLevel === null is the same fact without the string matching.
 */
function earnedTitle(titles: StudentTitle[] | null, activityType: string | null): string | null {
  if (!titles || !activityType) return null;
  const entry = titles.find((candidate) => candidate.activityType === activityType);
  if (!entry || entry.difficultyLevel === null) return null;
  return entry.title;
}

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
  // Fetched separately from the cards (same shape as app/dashboard/page.tsx's titles effect) so a
  // failing titles call costs a title, not the whole activity list — the cards are the page.
  const [titles, setTitles] = useState<StudentTitle[] | null>(null);
  // GitHub #108: explicit loading state rather than inferring it from cards === null — the
  // retry button needs to distinguish "haven't loaded yet" from "loaded, then failed".
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Every value on a Type A card is server-derived now (GitHub #272): the running session comes
  // from loadSessions('in-progress') — which already carries answeredCount/questionCount, so the
  // card can say how far along it is — and the best score from loadCompletedAttempts, fetched in
  // parallel, once per activity. The title arrives from loadStudentTitles in the effect below.
  // Nothing here reads lib/activityStore.ts any more: nothing writes to that mock since the play
  // flow moved to the API, so its level was frozen at 1 and its title at "Not yet started"
  // forever — the actual bug behind #272, not just its wording.
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

      // The whole session, not just its activity_type: answeredCount/questionCount drive the
      // "In progress · 1 of 4" line, and difficulty_level the level pill.
      const runningByType = new Map(sessionsResult.data.sessions.map((session) => [session.activity_type, session]));

      const typeACards: CardData[] = ACTIVITIES.map((activity, i) => {
        const attemptsResult = attemptResults[i];
        const attempts = attemptsResult.ok ? attemptsResult.data.attempts : [];
        const best = attempts.length === 0 ? null : attempts.reduce((b, a) => (a.score > b.score ? a : b), attempts[0]);
        const running = runningByType.get(activity.activityType) ?? null;
        return {
          activity,
          activityType: activity.activityType,
          // Same derivation as app/activities/[slug]/page.tsx's displayLevel, so the card and the
          // page it links to can't disagree: the running session's level, else the level clicking
          // Start would actually produce. (Server-side level progression doesn't exist yet.)
          level: (running?.difficulty_level ?? START_DIFFICULTY_LEVEL) as Difficulty,
          status: deriveActivityCardStatus(running, best ? { score: best.score, maxScore: best.maxScore } : null),
        };
      });

      // Type B (GitHub #149, REQ-FU-2): no session_log row is ever created for this activity —
      // see app/activities/write-acceptance-criteria/page.tsx — so it can't join the
      // loadCompletedAttempts/loadSessions calls above. Its progress comes from the same
      // localStorage session the activity's own page trusts (lib/acceptanceCriteriaSessionStore.ts),
      // which is the point: the card now says exactly what the student sees after clicking it.
      // Best score stays null — no student-facing endpoint lists their own graded submissions —
      // and activityType is null because there is no row in the titles response to look up.
      const stored = getStoredSession();
      const acSession = stored && !isSessionComplete(stored) ? stored : null;
      const writeAcCard: CardData = {
        activity: WRITE_ACCEPTANCE_CRITERIA_CARD,
        activityType: null,
        level: START_DIFFICULTY_LEVEL,
        status: deriveActivityCardStatus(
          acSession ? { answeredCount: answeredCount(acSession), questionCount: STORIES_PER_SESSION } : null,
          null,
        ),
      };

      setCards([...typeACards, writeAcCard]);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [token, profile, retryCount]);

  // REQ-GAM-BL-1: the earned mastery title per activity type, computed server-side from passed
  // sessions. Not cached (see loadStudentTitles) — a title the student just earned must show up.
  // A failed call leaves titles null, which simply renders no title, same as not having one.
  useEffect(() => {
    if (!token || !profile?.user_id) return;
    let cancelled = false;

    loadStudentTitles(token, profile.user_id).then((result) => {
      if (cancelled) return;
      if (result.ok) setTitles(result.data.titles);
    });

    return () => {
      cancelled = true;
    };
  }, [token, profile?.user_id, retryCount]);

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
              title={earnedTitle(titles, card.activityType)}
              status={card.status}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}
