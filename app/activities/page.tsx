'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { ActivityCard, type ActivityCardData } from '../../components/ActivityCard';
import { ActivityCardSkeleton } from '../../components/ActivityCardSkeleton';
import { deriveActivityCardStatus } from '../../lib/activityCardStatus';
import { buildCustomActivityDefinition, getActivityByType, type ActivityDefinition, type Difficulty } from '../../lib/activityContent';
import { loadAvailableActivities } from '../../lib/activityDiscoveryClient';
import { loadCompletedAttempts, loadSessions, loadStudentTitles, type StudentTitle } from '../../lib/sessionClient';
import { MAX_DIFFICULTY_LEVEL, nextDifficultyLevel } from '../../lib/sessionRules';
import { useRequireRole } from '../../lib/useRequireRole';

// A fixed guess for the loading skeleton's card count — real activities aren't known until
// GET /api/activities resolves (unlike the old hardcoded ACTIVITIES array, the list now depends
// on which courses the student is enrolled in), so this is just a plausible placeholder shape,
// the same "fixed slot count independent of real data" reasoning LevelReplaySelector's default
// totalLevels uses.
const SKELETON_COUNT = 3;

type CardData = {
  activity: ActivityCardData;
  /** The activity_type this card's title is looked up by; null for Type B, which has none. */
  activityType: string | null;
  running: { difficulty_level: number; answeredCount: number; questionCount: number } | null;
  best: { score: number; maxScore: number } | null;
};

/**
 * This student's titles entry for one activity, or null when they haven't attempted it
 * (GET /api/students/{id}/titles only returns a row per activity type actually attempted —
 * lib/titleQueries.ts) or this card has no activityType at all (Type B).
 */
function titleEntryFor(titles: StudentTitle[] | null, activityType: string | null): StudentTitle | null {
  if (!titles || !activityType) return null;
  return titles.find((candidate) => candidate.activityType === activityType) ?? null;
}

/**
 * The student's earned title for one activity, or null when they haven't passed a level yet.
 *
 * Keyed off difficultyLevel rather than the title string: GET /api/students/{id}/titles fills
 * `title` with the literal "Not yet started" for an attempted-but-never-passed activity
 * (lib/titleQueries.ts), and rendering that next to a real score is exactly what GitHub #272
 * reported. difficultyLevel === null is the same fact without the string matching.
 */
function earnedTitle(entry: StudentTitle | null): string | null {
  if (!entry || entry.difficultyLevel === null) return null;
  return entry.title;
}

export default function ActivitiesPage() {
  const { token, profile, loading, authorized } = useRequireRole('student');
  const [cards, setCards] = useState<CardData[] | null>(null);
  // Fetched separately from the cards (same shape as app/dashboard/page.tsx's titles effect) so a
  // failing titles call costs a title, not the whole activity list — the cards are the page.
  const [titles, setTitles] = useState<StudentTitle[] | null>(null);
  // GitHub #108: explicit loading state rather than inferring it from cards === null — the
  // retry button needs to distinguish "haven't loaded yet" from "loaded, then failed".
  const [isLoading, setIsLoading] = useState(true);
  // Titles load in their own effect below (a failing titles call must not cost the whole list),
  // but a card rendered before titles arrives would briefly show no title and the wrong level
  // (nextDifficultyLevel(null) — "Easy" — even for a student who's already passed levels), then
  // jump once titles lands. Tracked separately from isLoading so cards/titles can fail or arrive
  // independently while the page still waits for both before showing anything real.
  const [titlesLoading, setTitlesLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Every value on a Type A card is server-derived now (GitHub #272): the running session comes
  // from loadSessions('in-progress') — which already carries answeredCount/questionCount, so the
  // card can say how far along it is — and the best score from loadCompletedAttempts, fetched in
  // parallel, once per activity. Raw here (running/best), not the rendered level/status/title:
  // those also depend on titles, which loads in the separate effect below, so they're derived at
  // render time instead (see the JSX map) rather than getting stuck at whatever titles held the
  // moment this effect last ran. Nothing here reads lib/activityStore.ts any more: nothing writes
  // to that mock since the play flow moved to the API, so its level was frozen at 1 and its title
  // at "Not yet started" forever — the actual bug behind #272, not just its wording.
  //
  // The activity list itself is no longer the hardcoded ACTIVITIES array: every activity_type is
  // now linked to a course (activity_type_course), so GET /api/activities (loadAvailableActivities)
  // is asked first for exactly the ones this student's enrolled courses actually offer — built-in
  // or instructor-created alike. Each entry resolves to its rich static ActivityDefinition when
  // one exists (getActivityByType — the two Type A activities and Write Acceptance Criteria),
  // else a generic one built from the catalog's own name/description (buildCustomActivityDefinition).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setIsLoading(true);
    setLoadFailed(false);

    loadAvailableActivities(token).then((discoveryResult) => {
      if (cancelled) return;

      if (!discoveryResult.ok) {
        setLoadFailed(true);
        setIsLoading(false);
        return;
      }

      const resolvedActivities: ActivityDefinition[] = discoveryResult.data.activities.map(
        (entry) => getActivityByType(entry.activityType) ?? buildCustomActivityDefinition(entry),
      );

      const attemptsPromises = profile
        ? resolvedActivities.map((activity) => loadCompletedAttempts(token, profile.user_id, activity.activityType))
        : resolvedActivities.map(() => Promise.resolve({ ok: true as const, data: { attempts: [] } }));

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

        // Write Acceptance Criteria (GitHub #149, REQ-FU-2) is one of resolvedActivities like the
        // two Type A entries now that it has a real session_log row — loadSessions/
        // loadCompletedAttempts both key on activity_type, so it needs no special case here any
        // more (it used to read a local-only mock, which is what produced a second,
        // separately-built card for the same activity — see the "Write Acceptance Criteria
        // sessions" note in CLAUDE.md).
        const cards: CardData[] = resolvedActivities.map((activity, i) => {
          const attemptsResult = attemptResults[i];
          const attempts = attemptsResult.ok ? attemptsResult.data.attempts : [];
          const best = attempts.length === 0 ? null : attempts.reduce((b, a) => (a.score > b.score ? a : b), attempts[0]);
          const running = runningByType.get(activity.activityType) ?? null;
          return {
            activity,
            activityType: activity.activityType,
            running,
            best: best ? { score: best.score, maxScore: best.maxScore } : null,
          };
        });

        setCards(cards);
        setIsLoading(false);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [token, profile, retryCount]);

  // REQ-GAM-BL-1: the earned mastery title per activity type, computed server-side from passed
  // sessions. Not cached (see loadStudentTitles) — a title the student just earned must show up.
  // A failed call leaves titles null, which simply renders no title, same as not having one.
  useEffect(() => {
    if (!token || !profile?.user_id) {
      // Nothing to fetch yet — don't leave the page waiting forever on a load that never started
      // (see app/activities/[slug]/page.tsx's identical guard on its own loading state).
      setTitlesLoading(false);
      return;
    }
    let cancelled = false;
    setTitlesLoading(true);

    loadStudentTitles(token, profile.user_id).then((result) => {
      if (cancelled) return;
      if (result.ok) setTitles(result.data.titles);
      setTitlesLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [token, profile?.user_id, retryCount]);

  if (loading || !authorized) return null;

  return (
    <AppShell active="activities">
      <h3 className="mb-5 text-lg font-extrabold">Choose an activity</h3>

      {isLoading || titlesLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" role="status" aria-label="Loading activities">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <ActivityCardSkeleton key={i} />
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
      ) : cards && cards.length === 0 ? (
        // Genuinely possible now that the list is course-scoped (GET /api/activities), not a
        // fixed set of three: a student enrolled in no course, or in courses with nothing linked
        // yet, sees this instead of an empty grid.
        <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-8 text-center text-sm font-semibold text-gray-500">
          No activities yet — join a course to see what it offers.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {cards?.map((card) => {
            const titleEntry = titleEntryFor(titles, card.activityType);
            const highestPassedLevel = titleEntry?.difficultyLevel ?? null;
            const isMastered = highestPassedLevel === MAX_DIFFICULTY_LEVEL;

            // Same derivation as app/activities/[slug]/page.tsx's displayLevel, so the card and
            // the page it links to can't disagree: the running session's own level, else the
            // level the student's next click would actually produce (their next unpassed level,
            // capped at MAX_DIFFICULTY_LEVEL — see POST /api/sessions).
            const level = (card.running?.difficulty_level ?? nextDifficultyLevel(highestPassedLevel)) as Difficulty;

            return (
              <ActivityCard
                key={card.activity.slug}
                activity={card.activity}
                level={level}
                title={earnedTitle(titleEntry)}
                status={deriveActivityCardStatus(card.running, card.best, isMastered)}
              />
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
