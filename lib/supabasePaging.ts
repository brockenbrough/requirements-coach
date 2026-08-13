/**
 * Two guards against the failure mode a class-sized read runs into (GitHub #275, REQ-PL-3.4.4:
 * "at least 3 classes with 150 students per class").
 *
 * PostgREST caps a response at a server-configured maximum — 1000 rows by default — and says so
 * only in the Content-Range header, not in `error`. A query without .range() therefore *silently*
 * returns a prefix of the result set, and everything computed from it (class average, pass rate,
 * needsAttention, questionCount) is quietly wrong rather than failing loudly. One course of 150
 * students already clears that cap on session_to_question alone.
 *
 * Kept free of any Supabase import so it stays a pure helper testable without a client, the same
 * reason requireInstructor (lib/instructorAuth.ts) takes its client as an argument.
 */

/** PostgREST's default max-rows. Pages are requested at exactly this size. */
export const SUPABASE_MAX_ROWS = 1000;

/**
 * How many ids go into one .in(...) filter. PostgREST receives that list as a GET query string,
 * so ~1000 UUIDs is a ~37 KB URL — past what proxies accept (HTTP 414). 200 keeps a chunk near
 * 7 KB while still being one round trip per 200 sessions rather than per session.
 */
export const MAX_IN_LIST = 200;

type QueryResult<T, E> = { data: T[] | null; error: E | null };

/**
 * Runs `page` repeatedly with widening .range() bounds until a short page comes back, and
 * concatenates the results.
 *
 * `page` is a factory, not a query: a PostgREST builder is single-use, so each iteration has to
 * build a fresh one. Callers pass `(from, to) => supabase.from(...).select(...).range(from, to)`.
 *
 * A short page (fewer rows than pageSize) is the only termination signal PostgREST offers without
 * asking for an exact count, and it costs no extra request in the common case where everything
 * fits in one page.
 */
export async function fetchAllRows<T, E>(
  page: (from: number, to: number) => PromiseLike<QueryResult<T, E>>,
  pageSize: number = SUPABASE_MAX_ROWS,
): Promise<QueryResult<T, E>> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { data: null, error };

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < pageSize) return { data: rows, error: null };
  }
}

/**
 * Splits a list into chunks of at most `size`, for feeding .in(...) without blowing the URL up.
 * An empty input yields no chunks at all — callers must not issue a query for it, since
 * .in('col', []) is not something to rely on PostgREST for.
 */
export function chunked<T>(items: T[], size: number = MAX_IN_LIST): T[][] {
  if (size < 1) throw new Error('chunked: size must be at least 1');

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * chunked + fetchAllRows together: runs one paged read per chunk of ids and flattens the result.
 * Chunks run sequentially rather than in parallel — a class-wide read is already the heaviest
 * query in the app, and firing N of them at once is how a shared Supabase project starts
 * rate-limiting everyone else.
 */
export async function fetchAllRowsByIds<T, E, Id>(
  ids: Id[],
  page: (chunk: Id[], from: number, to: number) => PromiseLike<QueryResult<T, E>>,
  options: { chunkSize?: number; pageSize?: number } = {},
): Promise<QueryResult<T, E>> {
  const rows: T[] = [];

  for (const chunk of chunked(ids, options.chunkSize)) {
    const { data, error } = await fetchAllRows<T, E>(
      (from, to) => page(chunk, from, to),
      options.pageSize,
    );
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
  }

  return { data: rows, error: null };
}
