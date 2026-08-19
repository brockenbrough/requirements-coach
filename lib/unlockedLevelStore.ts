// GitHub #371: remembers the highest difficulty level a student has already *seen* unlocked for
// one activity type, so components/LevelReplaySelector.tsx can play its unlock animation exactly
// once — on the visit where the level actually became selectable, and never again.
//
// The unlock is derived here rather than handed over from the play page. app/activities/[slug]/
// page.tsx already computes highestSelectableLevel from the completed-attempts list it fetches
// anyway; comparing that against the value recorded on the last visit is enough, so nothing has
// to travel through a query param or router state from app/activities/[slug]/play/page.tsx (whose
// handleFinishSummary just router.push()es back to the detail page). Same shape as
// lib/previousRankStore.ts: a snapshot of "how things looked last time", diffed on arrival.
//
// LIMITS, stated plainly: this is per device and differs between browsers on the same device. A
// level passed on a phone is already unlocked when the laptop first loads the page, and the
// laptop has no record to diff against — so it records the baseline silently and shows no
// animation, rather than replaying a celebration for something the student did elsewhere. That is
// what newlyUnlockedLevel's `seen === null` case is for. clearAllClientCaches() (lib/
// clientCaches.ts) wipes this on logout, which has the same effect: the next sign-in re-records
// the baseline without animating.

import { clearJsonStore, readJsonStore, writeJsonStore } from './clientStorage';

// Bumped to v2 (GitHub #583): the per-activity key grew a third segment (assembledQuizId), so a
// v1 key (bare activityType) would never match a v2 lookup for the identical activity — rather
// than leave v1 entries silently unreadable forever under the same key, the whole store starts
// fresh, same as lib/completedAttemptsStore.ts's v2 -> v3 migration.
const STORAGE_KEY = 'rc_seen_unlocked_level_v2';

/** "activityType:assembledQuizId" -> the highest selectable level as of this student's last visit. */
type SeenLevelMap = Partial<Record<string, number>>;

type SeenUnlockedLevelStore = Partial<Record<string, SeenLevelMap>>; // studentId -> SeenLevelMap

// GitHub #583: assembledQuizId disambiguates two quizzes sharing a catalog, so their unlock
// animations don't share one baseline. Omitted -> the exact pre-#583 key, for a caller that
// doesn't know a specific quiz (a bare/bookmarked link).
function levelKey(activityType: string, assembledQuizId?: string | null): string {
  return `${activityType}:${assembledQuizId ?? 'none'}`;
}

/**
 * The highest selectable level this device last recorded for the student on one activity, or null
 * if it has never recorded one — a first visit, or the store was cleared on logout.
 */
export function getSeenUnlockedLevel(studentId: string, activityType: string, assembledQuizId?: string | null): number | null {
  const store = readJsonStore<SeenUnlockedLevelStore>(STORAGE_KEY);
  return store[studentId]?.[levelKey(activityType, assembledQuizId)] ?? null;
}

/**
 * Overwrites the recorded level. Callers must run this on every visit, not just the ones that
 * animate: recording unconditionally is what makes the diff idempotent, so a background
 * revalidation of the same data cannot re-trigger an animation that is already playing.
 */
export function recordSeenUnlockedLevel(studentId: string, activityType: string, level: number, assembledQuizId?: string | null): void {
  const store = readJsonStore<SeenUnlockedLevelStore>(STORAGE_KEY);
  store[studentId] = { ...store[studentId], [levelKey(activityType, assembledQuizId)]: level };
  writeJsonStore(STORAGE_KEY, store);
}

/**
 * The level whose lock should be shown opening, or null if nothing new was unlocked.
 *
 * Pure, so the interesting cases are testable without a DOM — this file's only logic worth
 * asserting on lives here, the same split lib/previousRankStore.ts uses for withRankChange.
 *
 * `seen === null` deliberately returns null: a student whose baseline has never been recorded
 * hasn't unlocked anything *on this device just now*, they simply arrived. Animating there would
 * fire on every fresh browser, and on a brand-new account's very first visit to the page.
 */
export function newlyUnlockedLevel(seen: number | null, current: number): number | null {
  return seen !== null && current > seen ? current : null;
}

export function clearSeenUnlockedLevels(): void {
  clearJsonStore(STORAGE_KEY);
}
