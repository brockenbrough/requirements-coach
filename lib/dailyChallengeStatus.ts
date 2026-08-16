// What the Daily Challenge dashboard card says (GitHub #336), split out from
// components/DailyChallengeCard.tsx so it can be tested as a pure helper — same reason
// lib/activityCardStatus.ts exists, since the components themselves stay untested by design.
//
// 'done' folds two different server states — a submitted attempt and an expired-but-never-
// submitted one — into one card message, because both mean the same thing to the student today:
// "come back tomorrow." The finer distinction (was there a score to show) only matters on the
// attempt page itself, where the two need visibly different screens.

import type { DailyChallengeState } from './dailyChallengeTypes';

export type DailyChallengeCardStatus =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'available' }
  | { kind: 'in-progress' }
  | { kind: 'done'; result: { correct: boolean; score: number } | null };

/** Which of the five states the card is in, from the raw GET /api/daily-challenge response. */
export function deriveDailyChallengeCardStatus(state: DailyChallengeState | null): DailyChallengeCardStatus {
  if (state === null) return { kind: 'loading' };

  if (!state.attempt) {
    return state.available ? { kind: 'available' } : { kind: 'unavailable' };
  }

  if (state.attempt.submitted_at) {
    return { kind: 'done', result: { correct: state.correct ?? false, score: state.score ?? 0 } };
  }

  if (state.expired) {
    return { kind: 'done', result: null };
  }

  return { kind: 'in-progress' };
}

/** The card's status line. One place, so the wording can't drift between the five states. */
export function dailyChallengeCardStatusLabel(status: DailyChallengeCardStatus): string {
  switch (status.kind) {
    case 'loading':
      return 'Checking today’s challenge…';
    case 'unavailable':
      return 'Join a course to unlock the Daily Challenge.';
    case 'available':
      return 'Double points, one question, today only.';
    case 'in-progress':
      return 'Challenge in progress — keep going!';
    case 'done':
      return status.result
        ? `You scored ${status.result.score} pts today — come back tomorrow.`
        : 'Time ran out today — come back tomorrow.';
  }
}
