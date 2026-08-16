import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Hoisted so the vi.mock factory below can close over it safely.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
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

import { GET } from '../../app/api/activities/write-acceptance-criteria/sessions/current/route';

const sessionRow = {
  session_id: 'ac-session-1',
  user_id: 'user-123',
  activity_type: 'WRITE_ACCEPTANCE_CRITERIA',
  difficulty_level: 1,
  started_at: '2026-07-29T10:00:00.000Z',
  ended_at: null,
  status: 'in-progress',
  cumulative_score: 8,
  max_score: 40,
  passed: false,
};

const drawnStories = Array.from({ length: 4 }, (_, i) => ({
  position: i,
  story: { user_story_id: `story-${i + 1}`, story_text: `As a user, I want ${i + 1}...` },
}));

/** One submission already made: story-1 graded 8/10. */
const existingSubmissions = [
  {
    submission_id: 'submission-1',
    user_story_id: 'story-1',
    submitted_text: 'Given ... when ... then ...',
    llm_score: 8,
    llm_feedback: 'Clear and testable.',
    submitted_at: '2026-07-29T10:05:00.000Z',
    graded_at: '2026-07-29T10:05:05.000Z',
  },
];

function req(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/activities/write-acceptance-criteria/sessions/current', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('GET /api/activities/write-acceptance-criteria/sessions/current', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.tables = [];
  });

  it('returns 401 without a token', async () => {
    expect((await GET(req(null))).status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    expect((await GET(req('bad-token'))).status).toBe(401);
  });

  // Nothing in progress is a normal state, not an error: the client shows "start" instead.
  it('returns 200 with a null session when nothing is in progress', async () => {
    queue('session_log', { data: null, error: null });

    const response = await GET(req());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.session).toBeNull();
    expect(body.stories).toEqual([]);
    expect(body.submissions).toEqual([]);
    expect(body.answeredCount).toBe(0);
    expect(body.nextPosition).toBeNull();
  });

  it('resumes at the first unsubmitted story', async () => {
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_user_story', { data: drawnStories, error: null });
    queue('submission', { data: existingSubmissions, error: null });

    const response = await GET(req());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.session).toEqual(sessionRow);
    expect(body.stories).toHaveLength(4);
    expect(body.stories.map((s: { position: number }) => s.position)).toEqual([0, 1, 2, 3]);

    // story-1 is submitted, so position 1 is where the student continues.
    expect(body.answeredCount).toBe(1);
    expect(body.nextPosition).toBe(1);
    expect(body.completed).toBe(false);
  });

  it('returns the submissions already made, including their grading', async () => {
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_user_story', { data: drawnStories, error: null });
    queue('submission', { data: existingSubmissions, error: null });

    const body = await (await GET(req())).json();

    expect(body.submissions).toHaveLength(1);
    expect(body.submissions[0]).toEqual({
      submissionId: 'submission-1',
      userStoryId: 'story-1',
      submittedText: 'Given ... when ... then ...',
      score: 8,
      feedback: 'Clear and testable.',
      submittedAt: '2026-07-29T10:05:00.000Z',
      gradedAt: '2026-07-29T10:05:05.000Z',
    });
  });

  it('reports a fresh session with no submissions yet', async () => {
    queue('session_log', { data: { ...sessionRow, cumulative_score: 0 }, error: null });
    queue('session_to_user_story', { data: drawnStories, error: null });
    queue('submission', { data: [], error: null });

    const body = await (await GET(req())).json();

    expect(body.submissions).toEqual([]);
    expect(body.answeredCount).toBe(0);
    expect(body.nextPosition).toBe(0);
    expect(body.completed).toBe(false);
  });

  it('reports completed when every story has been submitted', async () => {
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_user_story', { data: drawnStories, error: null });
    queue('submission', {
      data: drawnStories.map((row) => ({
        submission_id: `submission-${row.story.user_story_id}`,
        user_story_id: row.story.user_story_id,
        submitted_text: 'text',
        llm_score: 9,
        llm_feedback: 'Great.',
        submitted_at: '2026-07-29T10:10:00.000Z',
        graded_at: '2026-07-29T10:10:05.000Z',
      })),
      error: null,
    });

    const body = await (await GET(req())).json();

    expect(body.answeredCount).toBe(4);
    expect(body.nextPosition).toBeNull();
    expect(body.completed).toBe(true);
  });

  // Submissions may arrive in any order; the next position must not depend on it.
  it('derives the next position independently of row order', async () => {
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_user_story', { data: [...drawnStories].reverse(), error: null });
    queue('submission', { data: [...existingSubmissions], error: null });

    const body = await (await GET(req())).json();

    expect(body.nextPosition).toBe(1);
  });
});
