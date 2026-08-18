'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Avatar } from './Avatar';
import { LeaderboardRankBadge } from './LeaderboardRankBadge';
import { RankChangeIndicator } from './RankChangeIndicator';
import { StreakBadge } from './StreakBadge';
import { GLOBAL_LEADERBOARD_KEY, loadGlobalLeaderboard } from '../lib/studentCourseClient';
import { recordLeaderboardRanks } from '../lib/previousRankStore';
import type { LeaderboardEntry } from '../lib/leaderboardTypes';

const TOP_COUNT = 5;

function PreviewRow({ entry, isCurrentUser }: { entry: LeaderboardEntry; isCurrentUser: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-brand-md px-2 py-2 ${
        isCurrentUser ? 'bg-brand-navy-border' : ''
      }`}
    >
      <LeaderboardRankBadge rank={entry.rank} />
      <Avatar avatarUrl={entry.avatarUrl} fallbackName={entry.username} size="sm" />
      <Link
        href={`/students/${encodeURIComponent(entry.studentId)}`}
        className="min-w-0 flex-1 truncate text-sm font-extrabold text-white underline-offset-2 hover:text-brand-purple hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-teal"
      >
        {entry.username}
        {isCurrentUser ? <span className="ml-2 text-xs font-extrabold text-brand-purple">You</span> : null}
      </Link>
      <StreakBadge streak={entry.streak} />
      <span className="whitespace-nowrap text-sm font-bold tabular-nums text-brand-ink">
        {entry.points.toLocaleString()}
      </span>
      <span className="w-10 flex-none text-right">
        <RankChangeIndicator change={entry.rankChange} />
      </span>
    </div>
  );
}

/**
 * The dashboard's glance at the GLOBAL leaderboard (GitHub #432 follow-up): the top five, plus
 * the student's own row appended when they didn't make it, ranked by total score across every
 * course the student shares with the people shown — not one course's own points. The per-course
 * leaderboard lives elsewhere now: app/leaderboard/page.tsx (with its course switcher) and
 * components/CourseLeaderboard.tsx (embedded on a course's own quiz-list page) are the two
 * course-scoped readers of GET /api/courses/{courseId}/leaderboard; this is the one reader of the
 * separate, global GET /api/leaderboard (lib/leaderboardQueries.ts's computeGlobalLeaderboard) —
 * intentionally two different endpoints, not the same query reused with/without a filter.
 *
 * Deliberately not LeaderboardTable at a smaller size. This sits in a ~600px dashboard column
 * next to the mastery cards, where five table columns with headers would be cramped; a stacked
 * flex row reads better at that width. What the two views DO share is every piece that carries
 * meaning — LeaderboardRankBadge, Avatar and RankChangeIndicator — so the podium colours, the
 * initials fallback and the arrow semantics cannot drift between them. Only the layout differs.
 *
 * Reads GET /api/leaderboard via lib/studentCourseClient.ts's loadGlobalLeaderboard, cached under
 * the reserved GLOBAL_LEADERBOARD_KEY in the same courseId-keyed stores real course leaderboards
 * use (lib/leaderboardStore.ts, lib/previousRankStore.ts) — a completed session's existing
 * cache-clear (the play flow's handleFinishSummary) already covers this entry too. An empty
 * result can only mean "not enrolled in any course at all" (see computeGlobalLeaderboard's own
 * doc: the viewer's own row would otherwise always appear, even at 0 points), so that's the one
 * case rendered as "join a course" rather than "be the first".
 */
export function LeaderboardPreview({ token, studentId }: { token: string; studentId?: string }) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadGlobalLeaderboard(token).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setEntries(result.data.entries);
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!entries || entries.length === 0) return;
    recordLeaderboardRanks(GLOBAL_LEADERBOARD_KEY, entries);
  }, [entries]);

  if (entries === null && !failed) {
    return (
      <section className="mb-7 animate-pulse rounded-brand-lg bg-brand-navy p-6" aria-hidden="true">
        <div className="mb-4 h-6 w-32 rounded-full bg-white/10" />
        <div className="space-y-2">
          {Array.from({ length: TOP_COUNT }, (_, i) => (
            <div key={i} className="h-11 rounded-brand-md bg-white/5" />
          ))}
        </div>
      </section>
    );
  }

  const rows = entries ?? [];
  const top = rows.slice(0, TOP_COUNT);
  const me = rows.find((entry) => entry.studentId === studentId) ?? null;
  const meInTop = top.some((entry) => entry.studentId === studentId);
  // An empty result here only ever means "not enrolled anywhere" — see computeGlobalLeaderboard's
  // own doc: the viewer's own courses always include the viewer, so a real, non-empty enrollment
  // would always produce at least the viewer's own row.
  const notEnrolled = !failed && rows.length === 0;

  return (
    <section className="mb-7 rounded-brand-lg bg-brand-navy p-6 text-brand-ink">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xl font-extrabold text-white">Leaderboard</h3>
      </div>

      {failed ? (
        <p className="mb-4 text-sm font-semibold text-brand-ink-muted">Could not load the leaderboard.</p>
      ) : notEnrolled ? (
        <p className="mb-4 text-sm font-semibold text-brand-ink-muted">
          Join a course to see how you compare with your classmates.
        </p>
      ) : (
        <div className="mb-4">
          {top.map((entry) => (
            <PreviewRow
              key={entry.studentId}
              entry={entry}
              isCurrentUser={entry.studentId === studentId}
            />
          ))}

          {/* Only when the student is outside the top five. The ellipsis makes the jump in rank
              explicit, so an appended row can't be misread as sixth place. */}
          {me && !meInTop ? (
            <>
              <div aria-hidden="true" className="px-2 py-1 text-center text-xs font-bold text-brand-ink-muted">
                ⋯
              </div>
              <PreviewRow entry={me} isCurrentUser />
            </>
          ) : null}
        </div>
      )}

      <Link
        href={notEnrolled ? '/courses' : '/leaderboard'}
        className="block w-full rounded-brand-md border border-brand-teal py-2.5 text-center text-sm font-extrabold text-brand-teal transition hover:bg-brand-teal/10"
      >
        {notEnrolled ? 'Browse courses' : 'View course leaderboards →'}
      </Link>
    </section>
  );
}
