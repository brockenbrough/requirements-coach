import { describe, expect, it } from 'vitest';
import { activityCardStatusLabel, deriveActivityCardStatus } from '../../lib/activityCardStatus';

describe('deriveActivityCardStatus', () => {
  it('reports a running session with its progress', () => {
    expect(deriveActivityCardStatus({ answeredCount: 1, questionCount: 4 }, null, false)).toEqual({
      kind: 'in-progress',
      answered: 1,
      total: 4,
    });
  });

  it('reports the best score once the activity has been finished at least once', () => {
    expect(deriveActivityCardStatus(null, { score: 45, maxScore: 100 }, false)).toEqual({
      kind: 'best-score',
      score: 45,
      maxScore: 100,
    });
  });

  it('reports the empty state only when there is genuinely no history', () => {
    expect(deriveActivityCardStatus(null, null, false)).toEqual({ kind: 'not-attempted' });
  });

  it('prefers a running session over a best score', () => {
    // The next click resumes the session, so that is the useful thing to show — even for a
    // student who has already passed this activity before.
    expect(deriveActivityCardStatus({ answeredCount: 2, questionCount: 4 }, { score: 100, maxScore: 100 }, false)).toEqual({
      kind: 'in-progress',
      answered: 2,
      total: 4,
    });
  });

  it('falls back to the standard session length rather than showing "of 0"', () => {
    expect(deriveActivityCardStatus({ answeredCount: 0, questionCount: 0 }, null, false)).toEqual({
      kind: 'in-progress',
      answered: 0,
      total: 4,
    });
  });

  it('reports mastered once every level has been passed, even over a plain best score', () => {
    expect(deriveActivityCardStatus(null, { score: 100, maxScore: 100 }, true)).toEqual({ kind: 'mastered' });
  });

  it('prefers a running session over mastered', () => {
    // Resuming the session is still the useful next click, even after every level is passed —
    // same reasoning as preferring a running session over a plain best score.
    expect(deriveActivityCardStatus({ answeredCount: 1, questionCount: 4 }, { score: 100, maxScore: 100 }, true)).toEqual({
      kind: 'in-progress',
      answered: 1,
      total: 4,
    });
  });
});

describe('activityCardStatusLabel', () => {
  it('names the action rather than the missing history when nothing has been attempted', () => {
    // GitHub #272: the old "Not started yet" was wrong for anyone who had attempted the activity,
    // and sat one line under the title slot's "Not yet started" — two near-identical strings
    // with opposite meanings.
    expect(activityCardStatusLabel({ kind: 'not-attempted' })).toBe('Start this activity');
  });

  it('shows how far a running session got', () => {
    expect(activityCardStatusLabel({ kind: 'in-progress', answered: 1, total: 4 })).toBe('In progress · 1 of 4');
  });

  it('shows the best score', () => {
    expect(activityCardStatusLabel({ kind: 'best-score', score: 90, maxScore: 100 })).toBe('Best score: 90 / 100');
  });

  it('announces that every level has been completed', () => {
    expect(activityCardStatusLabel({ kind: 'mastered' })).toBe('All levels completed!');
  });

  it('never produces the mastery title placeholder', () => {
    const labels = [
      activityCardStatusLabel({ kind: 'not-attempted' }),
      activityCardStatusLabel({ kind: 'in-progress', answered: 0, total: 4 }),
      activityCardStatusLabel({ kind: 'best-score', score: 0, maxScore: 100 }),
      activityCardStatusLabel({ kind: 'mastered' }),
    ];
    expect(labels.some((label) => label.toLowerCase().includes('not yet started'))).toBe(false);
  });
});
