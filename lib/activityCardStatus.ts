// What the status line on an activity card says (GitHub #272), split out from
// components/ActivityCard.tsx so it can be tested as a pure helper — same reason
// lib/pagination.ts exists, since the components themselves stay untested by design.
//
// The card carries two independent text slots, and #272 is what happens when they blur into
// each other: the mastery *title* ("Not yet started") sat one line above a status line reading
// "Best score: 90 / 100". Only this module decides the status line; the title slot is the
// student's earned rank (GET /api/students/{id}/titles) and is simply omitted until there is
// one, so no placeholder can ever be misread as an activity status again.
//
// Deliberately not folded into ActivityResultState (lib/activityLogTypes.ts): that type
// describes a session that exists, and has no room for "never attempted" — the one state this
// card most needs. Adding a fifth member there would ripple through ActivityStatusBadge's three
// Record<ActivityResultState, …> maps and ActivityFilters for no gain at either call site.

import { QUESTIONS_PER_SESSION } from './sessionRules';

export type ActivityCardStatus =
  | { kind: 'in-progress'; answered: number; total: number }
  | { kind: 'best-score'; score: number; maxScore: number }
  | { kind: 'not-attempted' };

/** The status line's text. One place, so the wording can't drift between the four card states. */
export function activityCardStatusLabel(status: ActivityCardStatus): string {
  switch (status.kind) {
    case 'in-progress':
      return `In progress · ${status.answered} of ${status.total}`;
    case 'best-score':
      return `Best score: ${status.score} / ${status.maxScore}`;
    case 'not-attempted':
      // Says what clicking the card does, rather than restating an empty history the student
      // may well not have — the original "Not started yet" was wrong for anyone with attempts.
      return 'Start this activity';
  }
}

/**
 * Which of the three states a card is in.
 *
 * A running session outranks a best score: the student's next click resumes it, so that is the
 * more useful thing to show even when they have finished this activity before. A best score
 * outranks the empty state for the same reason the empty state exists at all — it is only
 * honest when there is genuinely nothing behind it.
 *
 * questionCount falls back to QUESTIONS_PER_SESSION rather than rendering "of 0": a session with
 * no linked questions shouldn't be able to exist, and if one does, the constant is closer to the
 * truth than zero.
 */
export function deriveActivityCardStatus(
  inProgress: { answeredCount: number; questionCount: number } | null,
  bestScore: { score: number; maxScore: number } | null,
): ActivityCardStatus {
  if (inProgress) {
    return {
      kind: 'in-progress',
      answered: inProgress.answeredCount,
      total: inProgress.questionCount || QUESTIONS_PER_SESSION,
    };
  }

  if (bestScore) {
    return { kind: 'best-score', score: bestScore.score, maxScore: bestScore.maxScore };
  }

  return { kind: 'not-attempted' };
}
