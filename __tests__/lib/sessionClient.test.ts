import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadInstructorActivities } from '../../lib/sessionClient';
import type { InstructorActivityEntry } from '../../lib/sessionTypes';

// No vi.mock('../../lib/supabase') here, the same way __tests__/lib/instructorAuth.test.ts does
// without one: this is the client side of the wire, so the only collaborator to fake is fetch.
// lib/sessionClient.ts carries 'use client' but is plain TypeScript, and loadInstructorActivities
// touches none of the localStorage caches the other loaders use, so it imports cleanly under
// vitest's node environment.

const TOKEN = 'instructor-token';

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response> | Promise<never>) {
  const spy = vi.fn(impl);
  vi.stubGlobal('fetch', spy);
  return spy;
}

function jsonResponse(body: unknown, status: number) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const SESSION: InstructorActivityEntry = {
  session_id: 'session-1',
  user_id: 'student-1',
  activity_type: 'weak-user-stories',
  difficulty_level: 1,
  started_at: '2026-01-01T10:00:00.000Z',
  ended_at: '2026-01-01T10:05:00.000Z',
  status: 'completed',
  cumulative_score: 4,
  max_score: 4,
  passed: true,
  badge_id: null,
  questionCount: 4,
  answeredCount: 4,
  studentId: 'student-1',
  studentName: 'Ada Lovelace',
  nextPosition: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadInstructorActivities', () => {
  it('returns the class-wide sessions and sends the bearer token', async () => {
    const fetchSpy = stubFetch(() => jsonResponse({ sessions: [SESSION] }, 200));

    const result = await loadInstructorActivities(TOKEN);

    expect(result).toEqual({ ok: true, data: { sessions: [SESSION] } });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/instructor/activities');
    expect(init.method).toBe('GET');
    // The point of routing instructor pages through this module: no page assembles this header.
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('reports a non-2xx response as a failed result instead of throwing', async () => {
    stubFetch(() => jsonResponse({ error: 'Something went wrong.' }, 500));

    await expect(loadInstructorActivities(TOKEN)).resolves.toEqual({
      ok: false,
      status: 500,
      error: 'Something went wrong.',
    });
  });

  it('keeps the status even when the error response has no body to read', async () => {
    // requireInstructor's 403 answers with no body at all (GitHub #169), so there is no
    // { error } to pick apart — the caller still has to get 403 rather than an exception.
    stubFetch(() => Promise.resolve(new Response(null, { status: 403 })));

    const result = await loadInstructorActivities(TOKEN);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ status: 403 });
  });

  it('reports a request that never reached the server as status 0', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    // Status 0 is what lets the page say "server unreachable" instead of blaming the server
    // for an error it never got the chance to send.
    await expect(loadInstructorActivities(TOKEN)).resolves.toEqual({
      ok: false,
      status: 0,
      error: 'Could not reach the server. Please try again.',
    });
  });
});
