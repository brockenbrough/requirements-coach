// GitHub #258: verify that a student's completed AC sessions are cached in localStorage so the
// activity landing page renders without a network round trip on revisit.
//
// localStorage is mocked via vi.stubGlobal so the node test environment can run these without
// jsdom — same technique the other lib tests use for fetch.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCompletedAttempts } from '../../lib/sessionClient';
import { clearAllClientCaches } from '../../lib/clientCaches';
import type { CompletedAttempt } from '../../lib/sessionClient';

const TOKEN = 'student-token';
const STUDENT_ID = 'student-1';
const OTHER_STUDENT_ID = 'student-2';

const ATTEMPT: CompletedAttempt = {
  sessionId: 'session-abc',
  difficultyLevel: 1,
  score: 7,
  maxScore: 40,
  passed: false,
  completedAt: '2026-08-01T10:00:00.000Z',
};

function makeLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
}

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal('fetch', spy);
  return spy;
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  // sessionStorage too: clearAllClientCaches also clears lib/leaderboardStore.ts and
  // lib/leaderboardCoursesStore.ts, both sessionStorage-backed (GitHub #328/#329).
  vi.stubGlobal('window', { localStorage: makeLocalStorageMock(), sessionStorage: makeLocalStorageMock() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadCompletedAttempts — WRITE_ACCEPTANCE_CRITERIA cache (GitHub #258)', () => {
  it('AC1: returns cached attempts on revisit without hitting the network', async () => {
    // First visit: cold cache → network call.
    const fetchSpy = stubFetch(() => jsonResponse({ attempts: [ATTEMPT] }));
    await loadCompletedAttempts(TOKEN, STUDENT_ID, 'WRITE_ACCEPTANCE_CRITERIA');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second visit: cache is warm → no fetch.
    const result = await loadCompletedAttempts(TOKEN, STUDENT_ID, 'WRITE_ACCEPTANCE_CRITERIA');
    expect(fetchSpy).toHaveBeenCalledTimes(1); // still 1 — no second request
    expect(result).toEqual({ ok: true, data: { attempts: [ATTEMPT] } });
  });

  it('AC2: forceRefresh re-fetches after a session completes and updates the cache', async () => {
    const newAttempt: CompletedAttempt = { ...ATTEMPT, sessionId: 'session-xyz', score: 35, passed: true };
    const fetchSpy = stubFetch(() => jsonResponse({ attempts: [ATTEMPT, newAttempt] }));

    // Warm the cache with the old list.
    await loadCompletedAttempts(TOKEN, STUDENT_ID, 'WRITE_ACCEPTANCE_CRITERIA');

    // Play page calls forceRefresh once a session finishes.
    const result = await loadCompletedAttempts(TOKEN, STUDENT_ID, 'WRITE_ACCEPTANCE_CRITERIA', {
      forceRefresh: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true, data: { attempts: [ATTEMPT, newAttempt] } });

    // Cache is now updated — next call serves the new list without fetch.
    const cached = await loadCompletedAttempts(TOKEN, STUDENT_ID, 'WRITE_ACCEPTANCE_CRITERIA');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(cached).toEqual({ ok: true, data: { attempts: [ATTEMPT, newAttempt] } });
  });

  it('AC4: with onRevalidate, a cache hit still fetches in the background and reports a changed result', async () => {
    // Warm the cache with the old list (device A).
    stubFetch(() => jsonResponse({ attempts: [ATTEMPT] }));
    await loadCompletedAttempts(TOKEN, STUDENT_ID, 'WRITE_ACCEPTANCE_CRITERIA');

    // Device B finished a session in the meantime — the server now has one more attempt.
    const newAttempt: CompletedAttempt = { ...ATTEMPT, sessionId: 'session-xyz', score: 35, passed: true };
    const fetchSpy = stubFetch(() => jsonResponse({ attempts: [newAttempt, ATTEMPT] }));

    const onRevalidate = vi.fn();
    const result = await loadCompletedAttempts(TOKEN, STUDENT_ID, 'WRITE_ACCEPTANCE_CRITERIA', { onRevalidate });

    // The cached list is what the caller gets back immediately...
    expect(result).toEqual({ ok: true, data: { attempts: [ATTEMPT] } });

    // ...but the background fetch still went out, and once it lands with a different result,
    // onRevalidate reports it.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(onRevalidate).toHaveBeenCalledWith([newAttempt, ATTEMPT]));
  });

  it("AC5: with onRevalidate, a cache hit whose background fetch matches doesn't report a change", async () => {
    stubFetch(() => jsonResponse({ attempts: [ATTEMPT] }));
    await loadCompletedAttempts(TOKEN, STUDENT_ID, 'WRITE_ACCEPTANCE_CRITERIA');

    const fetchSpy = stubFetch(() => jsonResponse({ attempts: [ATTEMPT] }));
    const onRevalidate = vi.fn();
    await loadCompletedAttempts(TOKEN, STUDENT_ID, 'WRITE_ACCEPTANCE_CRITERIA', { onRevalidate });

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    // Give the background .then() a chance to run — since it never fires, there's nothing to
    // wait for directly, so flush a tick and assert it stayed quiet.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onRevalidate).not.toHaveBeenCalled();
  });

  it('AC3: signing out clears the cache so the next student sees no previous history', async () => {
    // Student A warms the cache.
    stubFetch(() => jsonResponse({ attempts: [ATTEMPT] }));
    await loadCompletedAttempts(TOKEN, STUDENT_ID, 'WRITE_ACCEPTANCE_CRITERIA');

    // Sign out clears every localStorage cache.
    clearAllClientCaches();

    // Student B signs in — their first load must go to the network.
    const fetchSpy2 = stubFetch(() => jsonResponse({ attempts: [] }));
    const result = await loadCompletedAttempts(TOKEN, OTHER_STUDENT_ID, 'WRITE_ACCEPTANCE_CRITERIA');

    expect(fetchSpy2).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, data: { attempts: [] } });
  });
});
