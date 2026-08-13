'use client';

// One place that knows every localStorage cache the app keeps, so logout can drop them all.
//
// Without this the caches outlive the session: the next person to sign in on the same machine
// finds the previous account's data already on screen before the first fetch returns. Some of
// these hold *other people's* data — instructorStudentsStore has the class roster by name,
// acceptanceCriteriaSubmissionsStore has students' written answers and grades, and
// leaderboardStore/previousRankStore have classmates' usernames, photos and ranks — so leaving
// them behind is a disclosure, not just a stale-data bug.
//
// Each store exports its own clear function rather than exposing its STORAGE_KEY, keeping to the
// rule those modules already follow: only typed accessors leave the module, never the raw store.

import { clearCachedAcceptanceCriteriaSubmissions } from './acceptanceCriteriaSubmissionsStore';
import { clearCachedActivityLog } from './activityLogStore';
import { clearCachedCompletedAttempts } from './completedAttemptsStore';
import { clearCachedCompletedSessions } from './completedSessionsStore';
import { clearCachedInstructorActivities } from './instructorActivityStore';
import { clearCachedInstructorQuestions } from './instructorQuestionsStore';
import { clearCachedInstructorStudents } from './instructorStudentsStore';
import { clearCachedLeaderboard } from './leaderboardStore';
import { clearCachedLeaderboardCourses } from './leaderboardCoursesStore';
import { clearCachedLlmConfig } from './instructorLlmConfigStore';
import { clearCachedScore } from './scoreStore';
import { clearPreviousRanks } from './previousRankStore';

/**
 * Clears every cache that fronts an API call. Called from clearStoredAccessToken
 * (lib/authClient.ts) so both ways a session ends are covered: the explicit sign-out, and
 * UserProvider giving up after a refresh fails.
 *
 * lib/activityStore.ts (rc_activity_progress_v1) is deliberately NOT in this list. It is not a
 * cache — it is the only place the student's level, best score and earned title exist, with no
 * server copy to restore them from. Clearing it would be data loss dressed up as cleanup. Once
 * that module is migrated to the API (see CLAUDE.md's "two half-connected worlds"), it belongs
 * here like the rest.
 */
export function clearAllClientCaches(): void {
  if (typeof window === 'undefined') return;

  clearCachedScore();
  clearCachedCompletedSessions();
  clearCachedCompletedAttempts();
  clearCachedActivityLog();
  clearCachedInstructorActivities();
  clearCachedInstructorStudents();
  clearCachedInstructorQuestions();
  clearCachedAcceptanceCriteriaSubmissions();
  clearCachedLlmConfig();
  clearCachedLeaderboard();
  clearCachedLeaderboardCourses();
  clearPreviousRanks();
}
