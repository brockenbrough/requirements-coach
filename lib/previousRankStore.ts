// Tracks each student's rank on a course leaderboard as of their last visit, so
// RankChangeIndicator can render a delta for every row, not just the signed-in student's own.
// lib/leaderboardTypes.ts's LeaderboardEntry.rankChange doc already names this file as where the
// value comes from; this is that promise kept.
//
// LIMITS, stated plainly: this is per device, and differs between browsers on the same device —
// a phone and a laptop have no reason to agree about "last visit". It is wiped on logout by
// clearAllClientCaches() (lib/clientCaches.ts), same as every cache holding other students'
// data, so signing out and back in resets every row to "no previous ranking yet" (null, the grey
// dash — see RankChangeIndicator's own comment on why that's rendered distinctly from 0).
//
// Zero-migration alternative for later, if a server-side history turns out to be worth building:
// nothing here requires a new table. Replaying sumBestScores (lib/scoreQueries.ts) — the same
// reducer computeCourseLeaderboard uses — over session_log rows filtered to ended_at < T
// reconstructs any past scoreboard from data that already exists, so a server route could answer
// "rank as of last Tuesday" without ever having stored a snapshot.

const STORAGE_KEY = 'rc_previous_rank_v1';

/** studentId -> rank, as last recorded for one course. */
type RankMap = Record<string, number>;

type PreviousRankStore = Partial<Record<string, RankMap>>; // courseId -> RankMap

function readStore(): PreviousRankStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PreviousRankStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: PreviousRankStore) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/** This device's last-recorded rank for every student in a course, or null if never recorded. */
export function getPreviousRanks(courseId: string): RankMap | null {
  const store = readStore();
  return store[courseId] ?? null;
}

/**
 * Attaches rankChange to freshly ranked rows from a previous-rank snapshot: positive = moved up,
 * negative = moved down, 0 = unchanged, null = this student has no recorded previous rank (first
 * visit to this course's leaderboard on this device, or the store was cleared).
 *
 * Pure — does not read or write the store itself, so a caller can compute this render's deltas
 * before deciding whether/when to overwrite the snapshot (see recordLeaderboardRanks below).
 */
export function withRankChange<T extends { studentId: string; rank: number }>(
  rows: T[],
  previousRanks: RankMap | null,
): (T & { rankChange: number | null })[] {
  return rows.map((row) => {
    const previousRank = previousRanks?.[row.studentId];
    return { ...row, rankChange: previousRank === undefined ? null : previousRank - row.rank };
  });
}

/**
 * Overwrites the previous-rank snapshot for one course with the ranks just shown to the student.
 *
 * Callers must run this AFTER the rows carrying the OLD snapshot's rankChange have actually
 * rendered — typically a useEffect keyed on the fetched entries, so it fires once per fresh list
 * rather than during the render that used the old snapshot. Calling this before computing that
 * render's rankChange would compare the just-fetched ranks against themselves, and every delta
 * would read as 0 instead of against the prior visit.
 */
export function recordLeaderboardRanks(courseId: string, rows: { studentId: string; rank: number }[]): void {
  const ranks: RankMap = {};
  for (const row of rows) ranks[row.studentId] = row.rank;

  const store = readStore();
  store[courseId] = ranks;
  writeStore(store);
}

/** Drops every course's snapshot, for every course — see lib/clientCaches.ts. */
export function clearPreviousRanks(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
