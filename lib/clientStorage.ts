// The read/write pair every localStorage-backed cache in lib/ used to carry its own byte-identical
// copy of. Extracted for one specific reason (GitHub #275): only the *read* side had a try/catch.
//
// setItem throws QuotaExceededError once the origin's ~5 MB budget is full, and a class-sized
// instructor payload gets there. That throw happened inside a .then() with no .catch() on it, so
// the rejection surfaced nowhere and the page it belonged to sat on "Loading…" forever — a
// full cache presenting as a hung request. A cache that cannot store today's value must degrade
// to "no cache", never break the fetch that produced it.
//
// Every store keeps its own STORAGE_KEY, its own typed getters/setters and its own clear function;
// this only owns the three lines of window access underneath them.

/**
 * The parsed store at `key`, or an empty object when there is nothing there, the value is
 * unparseable, or we are rendering on the server. Never throws.
 */
export function readJsonStore<T extends object>(key: string): T {
  if (typeof window === 'undefined') return {} as T;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

/**
 * Persists `store` at `key`, silently doing nothing if it cannot.
 *
 * Swallowing the failure is deliberate: every caller is a cache write that happens *after* the
 * real data has already been handed to the caller, so a full or unavailable localStorage costs a
 * cache hit next time and nothing else. Making it throw would turn a storage problem into a
 * failed page load.
 */
export function writeJsonStore(key: string, store: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(store));
  } catch {
    // Quota exceeded, or storage disabled (private mode / blocked cookies). Nothing to do —
    // the next read simply misses and goes to the network.
  }
}

/** Drops the whole store at `key` — what each cache's clear…() calls on logout. */
export function clearJsonStore(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Same reasoning as writeJsonStore: storage being unavailable is not an error worth raising.
  }
}
