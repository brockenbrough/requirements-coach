// GitHub #39: reconciles GET /api/students/{id}/titles (what's been earned) with
// GET /api/students/{id}/available-titles (everything that can be earned) for the profile page's
// mastery section. Pure and framework-free — no 'use client', no network calls — so it's testable
// the way lib/sessionQueries.ts's own helpers are (see __tests__/lib/masteryTitles.test.ts).
//
// Both inputs are course-scoped API responses, not the old compile-time-fixed ACTIVITIES array
// (lib/activityContent.ts) — an activity only appears here if it's linked to a course the student
// (or, on a peer's profile, the student being viewed) is enrolled in. That's a deliberate change
// in behavior, not just a data-source swap: this reconciliation used to always show all three
// built-in activity types, even ones with no course link at all.

import type { AvailableActivityTitles, TitleLadderRung } from './leaderboardTypes';
import type { StudentTitle } from './sessionClient';

/**
 * One activity type's mastery standing, one entry per activity in the availableTitles list
 * passed in (see buildMasteryTitleEntries) — unlike GET /api/students/{id}/titles itself, which
 * (by its own documented design, REQ-GAM-BL-1.1) only returns an entry for an activity type the
 * student has actually attempted. The issue's own AC ("Displays all activity types known to the
 * system, not only those the student has attempted") needs the untried ones too, so
 * buildMasteryTitleEntries below fills those in as "not yet started" rather than the route being
 * changed to do it — changing what the route returns would ripple into every other consumer of
 * that same requirement-tied, already-tested behavior.
 */
export type MasteryTitleEntry = {
  activityType: string;
  activityName: string;
  /**
   * Every level's rung in order — e.g. "Story Apprentice", "Story Analyst", "Story Expert", each
   * with the title_definition id a student would wear. A rung whose title is null has no
   * title_definition row yet; see progressionOf below for why that stays null here.
   */
  progression: TitleLadderRung[];
  /** Highest level passed, or null if none has been. */
  currentLevel: number | null;
  /** progression[currentLevel - 1], or null alongside currentLevel === null. */
  currentTitle: string | null;
};

/**
 * The ladder's rungs in level order, kept as rungs rather than flattened to display strings.
 *
 * This used to substitute a generic "Level N" string for a level with no title_definition row (a
 * freshly created custom quiz, or WRITE_ACCEPTANCE_CRITERIA today, per lib/titleQueries.ts's own
 * note). That lost the distinction between "the title is called Level 2" and "there is no title
 * here", and components/TitleProgressionTrack.tsx renders a "Level N" sub-label under every rung's
 * name — so an untitled ladder came out as "Level 1 / Level 1 / Level 2 / Level 2 / …". Keeping
 * title null lets the track render the level line exactly once, and lets the title dropdown skip
 * rungs that aren't real, wearable titles.
 */
function progressionOf(activity: AvailableActivityTitles): TitleLadderRung[] {
  return activity.titles.slice().sort((a, b) => a.difficultyLevel - b.difficultyLevel);
}

/**
 * One entry per activity in availableTitles (GET /api/students/{id}/available-titles or the
 * equivalent field on a public profile), in that order, so the mastery section's card order never
 * depends on which activities a particular student has gotten to yet. apiTitles entries are
 * matched by activityType; anything availableTitles has that apiTitles doesn't is "not yet
 * started" (currentLevel/currentTitle both null).
 */
export function buildMasteryTitleEntries(
  availableTitles: AvailableActivityTitles[],
  apiTitles: StudentTitle[],
): MasteryTitleEntry[] {
  const byActivityType = new Map(apiTitles.map((entry) => [entry.activityType, entry]));

  return availableTitles.map((activity) => {
    const apiEntry = byActivityType.get(activity.activityType);
    return {
      activityType: activity.activityType,
      activityName: activity.activityName,
      progression: progressionOf(activity),
      currentLevel: apiEntry?.difficultyLevel ?? null,
      currentTitle: apiEntry?.title && apiEntry.difficultyLevel !== null ? apiEntry.title : null,
    };
  });
}

/**
 * "Total levels passed" (the profile page's completed-sessions summary) under sequential
 * progression: START_DIFFICULTY_LEVEL is 1 and a session always starts at the next unpassed
 * level (lib/sessionRules.ts), so having passed level N implies levels 1..N-1 were passed too —
 * summing currentLevel across activity types is therefore "how many level-passes total", not
 * just "how many activity types have any title".
 */
export function totalLevelsPassed(entries: MasteryTitleEntry[]): number {
  return entries.reduce((sum, entry) => sum + (entry.currentLevel ?? 0), 0);
}
