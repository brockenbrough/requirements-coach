import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Hoisted so the vi.mock factories below can close over it safely.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    inserts: [] as { table: string; payload: unknown }[],
    updates: [] as { table: string; payload: unknown }[],
    tables: [] as string[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      insert: (payload: unknown) => {
        state.inserts.push({ table, payload });
        return builder;
      },
      update: (payload: unknown) => {
        state.updates.push({ table, payload });
        return builder;
      },
      maybeSingle: async () => result,
      single: async () => result,
      // PostgrestFilterBuilder is thenable — queries without .single() are awaited directly.
      then: (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(onOk, onErr),
    };
    return builder;
  }

  return { state, makeBuilder };
});

/** Queues the result the next `from(table)` chain resolves to. */
function queue(table: string, result: Result) {
  (h.state.queues[table] ??= []).push(result);
}

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: async (token: string) =>
        token === 'valid-token'
          ? { data: { user: { id: 'user-123' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
    },
    from: (table: string) => {
      h.state.tables.push(table);
      const result = h.state.queues[table]?.shift() ?? { data: null, error: null };
      return h.makeBuilder(table, result);
    },
  }),
}));

vi.mock('../../lib/llm/factory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/llm/factory')>();
  return { ...actual, getLLMProvider: vi.fn() };
});

import { getLLMProvider } from '../../lib/llm/factory';
import { POST } from '../../app/api/activities/[activityType]/llm/submissions/route';

const ACTIVITY = 'WRITE_ACCEPTANCE_CRITERIA';
const PARAMS = (activityType: string = ACTIVITY) => ({ params: { activityType } });

/** activity_type as getGradingKind's .select('grading_kind').maybeSingle() returns it. */
function queueGradingKind(gradingKind: string | null) {
  queue('activity_type', { data: gradingKind === null ? null : { grading_kind: gradingKind }, error: null });
}

const SESSION_ID = 'ac-session-1';

const sessionRow = {
  session_id: SESSION_ID,
  user_id: 'user-123',
  activity_type: 'WRITE_ACCEPTANCE_CRITERIA',
  difficulty_level: 1,
  started_at: '2026-07-29T10:00:00.000Z',
  ended_at: null,
  status: 'in-progress',
  cumulative_score: 0,
  max_score: 40,
  passed: false,
};

const drawnStories = Array.from({ length: 4 }, (_, i) => ({
  position: i,
  story: { user_story_id: `story-${i + 1}`, story_text: `As a user, I want ${i + 1}...` },
}));

const STORY = {
  user_story_id: 'story-1',
  story_text: 'As a user, I want to log in with email.',
  creator_id: 'instructor-1',
  difficulty_level: 1,
};

const CONFIG = { provider: 'CLAUDE', api_key: 'sk-test', model: 'claude-opus-5' };

function submissionRow(userStoryId: string, score = 8) {
  return {
    submission_id: `submission-${userStoryId}`,
    user_story_id: userStoryId,
    submitted_text: 'text',
    llm_score: score,
    llm_feedback: 'Good.',
    submitted_at: '2026-07-29T10:05:00.000Z',
    graded_at: '2026-07-29T10:05:05.000Z',
  };
}

function req(body: object, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/activities/write-acceptance-criteria/submissions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** Queues the calls the route makes up to (but not including) the LLM call and its DB writes. */
function queueUpToLLM(options: { existingSubmissions?: unknown[]; story?: object } = {}) {
  queue('session_log', { data: sessionRow, error: null });
  queue('session_to_user_story', { data: drawnStories, error: null });
  queue('submission', { data: options.existingSubmissions ?? [], error: null });
  queue('user_story', { data: options.story ?? STORY, error: null });
  queue('instructor_llm_config', { data: CONFIG, error: null });
}

/** Queues the insert, update, and re-read calls for a submission that succeeds and does not complete the session. */
function queueSuccessfulWrite(nextSubmissionRow: unknown) {
  queue('submission', { data: null, error: null }); // insert
  queue('submission', { data: null, error: null }); // update after grading
  queue('session_log', { data: sessionRow, error: null }); // loadProgress's session re-read
  queue('submission', { data: [nextSubmissionRow], error: null }); // loadProgress's submissions re-read
}

const rateAcceptanceCriteria = vi.fn();

beforeEach(() => {
  h.state.queues = {};
  // Every test here targets a real llm-graded activity, so the route's grading-kind guard is
  // satisfied by default; the tests that exercise the guard itself re-queue this table.
  queueGradingKind('llm-graded');
  h.state.inserts = [];
  h.state.updates = [];
  h.state.tables = [];
  rateAcceptanceCriteria.mockReset();
  rateAcceptanceCriteria.mockResolvedValue({ score: 8, feedback: 'Clear and testable.' });
  vi.mocked(getLLMProvider).mockReset();
  vi.mocked(getLLMProvider).mockReturnValue({ rateAcceptanceCriteria } as never);
});

describe('POST /api/activities/[activityType]/llm/submissions', () => {
  it('returns 401 without a token', async () => {
    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'x', sessionId: SESSION_ID }, null), PARAMS());
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await POST(
      req({ userStoryId: 'story-1', submittedText: 'x', sessionId: SESSION_ID }, 'bad-token'),
      PARAMS(),
    );
    expect(response.status).toBe(401);
  });

  it('returns 400 when userStoryId is missing', async () => {
    const response = await POST(req({ submittedText: 'x', sessionId: SESSION_ID }), PARAMS());
    expect(response.status).toBe(400);
  });

  it('returns 400 when submittedText is missing', async () => {
    const response = await POST(req({ userStoryId: 'story-1', sessionId: SESSION_ID }), PARAMS());
    expect(response.status).toBe(400);
  });

  it('returns 400 when submittedText exceeds the length cap', async () => {
    const response = await POST(
      req({ userStoryId: 'story-1', submittedText: 'x'.repeat(5001), sessionId: SESSION_ID }),
      PARAMS(),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/5000/);
  });

  // GitHub #256 cost/abuse fix: sessionId is required, and it must be real — no more "auth check
  // + unthrottled LLM call".
  it('returns 400 when sessionId is missing', async () => {
    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'x' }), PARAMS());
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/sessionId/);
  });

  it('returns 404 when the session does not exist, belongs to another student, or is a different activity type', async () => {
    queue('session_log', { data: null, error: null });

    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'x', sessionId: SESSION_ID }), PARAMS());

    expect(response.status).toBe(404);
    expect(h.state.tables).not.toContain('session_to_user_story');
  });

  it('returns 409 when the session is already completed', async () => {
    queue('session_log', { data: { ...sessionRow, status: 'completed' }, error: null });

    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'x', sessionId: SESSION_ID }), PARAMS());

    expect(response.status).toBe(409);
  });

  it('returns 409 when the session is abandoned', async () => {
    queue('session_log', { data: { ...sessionRow, status: 'abandoned' }, error: null });

    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'x', sessionId: SESSION_ID }), PARAMS());

    expect(response.status).toBe(409);
  });

  it('returns 400 when the story does not belong to this session', async () => {
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_user_story', { data: drawnStories, error: null });
    queue('submission', { data: [], error: null });

    const response = await POST(
      req({ userStoryId: 'not-in-this-session', submittedText: 'x', sessionId: SESSION_ID }),
      PARAMS(),
    );

    expect(response.status).toBe(400);
    expect(h.state.tables).not.toContain('user_story');
  });

  it('returns 409 when submitting out of order', async () => {
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_user_story', { data: drawnStories, error: null });
    queue('submission', { data: [], error: null }); // nothing submitted yet — next is story-1

    const response = await POST(req({ userStoryId: 'story-2', submittedText: 'x', sessionId: SESSION_ID }), PARAMS());

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/story 1/i);
  });

  it('returns 409 when every story in the session is already submitted', async () => {
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_user_story', { data: drawnStories, error: null });
    queue('submission', {
      data: drawnStories.map((row) => submissionRow(row.story.user_story_id)),
      error: null,
    });

    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'x', sessionId: SESSION_ID }), PARAMS());

    expect(response.status).toBe(409);
  });

  it('returns 404 when the user story itself does not exist', async () => {
    queueUpToLLM();
    // Overwrite the queued user_story result with "not found".
    h.state.queues['user_story'] = [{ data: null, error: null }];

    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'x', sessionId: SESSION_ID }), PARAMS());

    expect(response.status).toBe(404);
  });

  it('returns 500 when the instructor has not configured an LLM provider', async () => {
    queueUpToLLM();
    h.state.queues['instructor_llm_config'] = [{ data: null, error: null }];

    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'x', sessionId: SESSION_ID }), PARAMS());

    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/LLM provider/i);
  });

  it('returns 500 when the configured provider is missing an API key', async () => {
    queueUpToLLM();
    vi.mocked(getLLMProvider).mockReturnValue(null);

    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'x', sessionId: SESSION_ID }), PARAMS());

    expect(response.status).toBe(500);
  });

  it('returns 502 when the LLM provider request fails', async () => {
    queueUpToLLM();
    rateAcceptanceCriteria.mockRejectedValue(new Error('provider timeout'));

    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'x', sessionId: SESSION_ID }), PARAMS());

    expect(response.status).toBe(502);
  });

  it('returns 409 when the same story was already submitted in this session (race)', async () => {
    queueUpToLLM();
    queue('submission', { data: null, error: { code: '23505', message: 'duplicate key' } }); // insert races

    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'x', sessionId: SESSION_ID }), PARAMS());

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/already been submitted/i);
  });

  it('grades and records a submission, carrying session_id and returning the next position', async () => {
    queueUpToLLM();
    queueSuccessfulWrite(submissionRow('story-1'));

    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'Given ... when ... then ...', sessionId: SESSION_ID }), PARAMS());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submission).toMatchObject({
      userStoryId: 'story-1',
      submittedText: 'Given ... when ... then ...',
      score: 8,
      feedback: 'Clear and testable.',
    });
    expect(body.answeredCount).toBe(1);
    expect(body.nextPosition).toBe(1);
    expect(body.completed).toBe(false);

    const insertedSubmission = h.state.inserts.find((i) => i.table === 'submission')!
      .payload as Record<string, unknown>;
    expect(insertedSubmission).toMatchObject({
      user_id: 'user-123',
      user_story_id: 'story-1',
      submitted_text: 'Given ... when ... then ...',
      session_id: SESSION_ID,
    });

    const updatedSubmission = h.state.updates.find((u) => u.table === 'submission')!
      .payload as Record<string, unknown>;
    expect(updatedSubmission).toMatchObject({
      llm_score: 8,
      // Easy (level 1): llmPointsForDifficulty(1) = 20, so an 8/10 rating scales to
      // round(8/10 * 20) = 16 gamification points.
      awarded_score: 16,
      llm_feedback: 'Clear and testable.',
      llm_provider: 'CLAUDE',
    });
  });

  it('scales the awarded score to a Medium/Hard prompt\'s higher point ceiling', async () => {
    queueUpToLLM({ story: { ...STORY, difficulty_level: 3 } });
    queueSuccessfulWrite(submissionRow('story-1'));
    rateAcceptanceCriteria.mockResolvedValue({ score: 9, feedback: 'Strong answer.' });

    await POST(req({ userStoryId: 'story-1', submittedText: 'x', sessionId: SESSION_ID }), PARAMS());

    const updatedSubmission = h.state.updates.find((u) => u.table === 'submission')!
      .payload as Record<string, unknown>;
    // Hard (level 3): llmPointsForDifficulty(3) = 60, so a 9/10 rating scales to
    // round(9/10 * 60) = 54 gamification points — the raw llm_score stays the unscaled 9.
    expect(updatedSubmission).toMatchObject({ llm_score: 9, awarded_score: 54 });
  });

  // Write-before-disclose: the row is committed before grading, and the score/feedback columns
  // are filled in afterward — the insert payload itself must never carry them.
  it('inserts the submission before grading, with grading columns left for the update', async () => {
    queueUpToLLM();
    queueSuccessfulWrite(submissionRow('story-1'));

    await POST(req({ userStoryId: 'story-1', submittedText: 'x', sessionId: SESSION_ID }), PARAMS());

    const insertedSubmission = h.state.inserts.find((i) => i.table === 'submission')!
      .payload as Record<string, unknown>;
    expect(insertedSubmission).not.toHaveProperty('llm_score');
    expect(insertedSubmission).not.toHaveProperty('awarded_score');
    expect(insertedSubmission).not.toHaveProperty('llm_feedback');
  });

  it('completes the session and reports totals once the last story is graded', async () => {
    // 3 of 4 stories already submitted — story-4 (position 3) is next.
    const alreadySubmitted = drawnStories.slice(0, 3).map((row) => submissionRow(row.story.user_story_id, 8));
    queueUpToLLM({ existingSubmissions: alreadySubmitted });

    queue('submission', { data: null, error: null }); // insert
    queue('submission', { data: null, error: null }); // update after grading
    queue('session_log', { data: { ...sessionRow, cumulative_score: 24 }, error: null }); // loadProgress's session re-read
    queue('submission', {
      data: [...alreadySubmitted, submissionRow('story-4', 8)],
      error: null,
    }); // loadProgress's submissions re-read — all 4 now graded
    queue('session_log', {
      data: { ...sessionRow, cumulative_score: 32, status: 'completed', passed: true, ended_at: '2026-07-29T10:20:00.000Z' },
      error: null,
    }); // completeAcSession's update

    const response = await POST(req({ userStoryId: 'story-4', submittedText: 'x', sessionId: SESSION_ID }), PARAMS());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.completed).toBe(true);
    expect(body.nextPosition).toBeNull();
    expect(body.session.status).toBe('completed');
    expect(body.session.passed).toBe(true);

    const sessionCompletion = h.state.updates.find(
      (u) => u.table === 'session_log' && (u.payload as Record<string, unknown>).status === 'completed',
    )!.payload as Record<string, unknown>;
    expect(sessionCompletion).toMatchObject({ status: 'completed' });
    expect(sessionCompletion.ended_at).toBeTruthy();
  });
});
