// GitHub #39: reconciles GET /api/students/{id}/titles with the full set of known activity
// types, for the profile page's mastery section. Pure and framework-free — no 'use client', no
// network calls — so it's testable the way lib/sessionQueries.ts's own helpers are (see
// __tests__/lib/masteryTitles.test.ts).

import { ACTIVITIES, type Difficulty } from './activityContent';
import type { StudentTitle } from './sessionClient';

/**
 * One activity type's mastery standing, always present for every activity type the app knows
 * about — unlike GET /api/students/{id}/titles itself, which (by its own documented design,
 * REQ-GAM-BL-1.1) only returns an entry for an activity type the student has actually
 * attempted. The issue's own AC ("Displays all activity types known to the system, not only
 * those the student has attempted") needs the untried ones too, so buildMasteryTitleEntries
 * below fills those in as "not yet started" rather than the route being changed to do it —
 * changing what the route returns would ripple into every other consumer of that same
 * requirement-tied, already-tested behavior.
 */
export type MasteryTitleEntry = {
  activityType: string;
  activityName: string;
  /** Every level's title in order, e.g. ["Story Apprentice", "Story Analyst", "Story Master"]. */
  progression: string[];
  /** Highest level passed, or null if none has been. */
  currentLevel: number | null;
  /** progression[currentLevel - 1], or null alongside currentLevel === null. */
  currentTitle: string | null;
};

function progressionOf(titles: Record<Difficulty, string>): string[] {
  return [titles[1], titles[2], titles[3]];
}

/**
 * One entry per activity type in ACTIVITIES (lib/activityContent.ts), in that fixed order, so
 * the mastery section's card order never depends on which activities a particular student has
 * gotten to yet. apiTitles entries are matched by activityType; anything ACTIVITIES has that
 * apiTitles doesn't is "not yet started" (currentLevel/currentTitle both null).
 */
export function buildMasteryTitleEntries(apiTitles: StudentTitle[]): MasteryTitleEntry[] {
  const byActivityType = new Map(apiTitles.map((entry) => [entry.activityType, entry]));

  return ACTIVITIES.map((activity) => {
    const apiEntry = byActivityType.get(activity.activityType);
    return {
      activityType: activity.activityType,
      activityName: activity.name,
      progression: progressionOf(activity.titles),
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
