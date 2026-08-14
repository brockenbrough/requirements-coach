import { describe, expect, it } from 'vitest';
import { dailyChallengeCardStatusLabel, deriveDailyChallengeCardStatus } from '../../lib/dailyChallengeStatus';

describe('deriveDailyChallengeCardStatus', () => {
  it('reports loading before the first fetch resolves', () => {
    expect(deriveDailyChallengeCardStatus(null)).toEqual({ kind: 'loading' });
  });

  it('reports unavailable when nothing has been drawn and no questions are eligible', () => {
    expect(deriveDailyChallengeCardStatus({ attempt: null, available: false, question: null })).toEqual({
      kind: 'unavailable',
    });
  });

  it('reports available when nothing has been drawn and questions are eligible', () => {
    expect(deriveDailyChallengeCardStatus({ attempt: null, available: true, question: null })).toEqual({
      kind: 'available',
    });
  });

  const attempt = {
    daily_challenge_attempt_id: 'a-1',
    user_id: 'u-1',
    question_id: 'q-1',
    challenge_date: '2026-08-14',
    started_at: '2026-08-14T10:00:00.000Z',
    deadline_at: '2026-08-14T10:01:00.000Z',
    submitted_option: null,
    is_correct: null,
    score: null,
    submitted_at: null,
  };

  it('reports in-progress for an unsubmitted, unexpired attempt', () => {
    expect(
      deriveDailyChallengeCardStatus({ attempt, question: { question_id: 'q-1', question_prompt: '', difficulty_level: 1, activity_type: 'x', max_score: 25, options: [] }, expired: false }),
    ).toEqual({ kind: 'in-progress' });
  });

  it('reports done with no result for an expired, unsubmitted attempt', () => {
    expect(deriveDailyChallengeCardStatus({ attempt, question: null, expired: true })).toEqual({
      kind: 'done',
      result: null,
    });
  });

  it('reports done with the score for a submitted attempt', () => {
    const submitted = { ...attempt, submitted_option: 'a-1', is_correct: true, submitted_at: '2026-08-14T10:00:30.000Z' };
    expect(
      deriveDailyChallengeCardStatus({
        attempt: submitted,
        question: { question_id: 'q-1', question_prompt: '', difficulty_level: 1, activity_type: 'x', max_score: 25, options: [] },
        correct: true,
        score: 50,
        expired: false,
      }),
    ).toEqual({ kind: 'done', result: { correct: true, score: 50 } });
  });
});

describe('dailyChallengeCardStatusLabel', () => {
  it('names the action for the available state', () => {
    expect(dailyChallengeCardStatusLabel({ kind: 'available' })).toMatch(/double points/i);
  });

  it('shows the score for a completed attempt', () => {
    expect(dailyChallengeCardStatusLabel({ kind: 'done', result: { correct: true, score: 50 } })).toBe(
      'You scored 50 pts today — come back tomorrow.',
    );
  });

  it('shows a distinct message for an expired, unfinished attempt', () => {
    expect(dailyChallengeCardStatusLabel({ kind: 'done', result: null })).toBe('Time ran out today — come back tomorrow.');
  });

  it('invites joining a course when unavailable', () => {
    expect(dailyChallengeCardStatusLabel({ kind: 'unavailable' })).toMatch(/join a course/i);
  });
});
