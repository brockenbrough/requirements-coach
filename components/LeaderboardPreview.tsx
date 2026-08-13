'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Avatar } from './Avatar';
import { LeaderboardRankBadge } from './LeaderboardRankBadge';
import { RankChangeIndicator } from './RankChangeIndicator';
import { loadCourseLeaderboard, loadJoinableCourses } from '../lib/studentCourseClient';
import { recordLeaderboardRanks } from '../lib/previousRankStore';
import type { LeaderboardCourse, LeaderboardEntry } from '../lib/leaderboardTypes';

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
 * The dashboard's glance at the course leaderboard: the top five, plus the student's own row
 * appended when they didn't make it, so the panel always answers "where am I?" without a click.
 *
 * Deliberately not LeaderboardTable at a smaller size. This sits in a ~600px dashboard column
 * next to the mastery cards, where five table columns with headers would be cramped; a stacked
 * flex row reads better at that width. What the two views DO share is every piece that carries
 * meaning — LeaderboardRankBadge, Avatar and RankChangeIndicator — so the podium colours, the
 * initials fallback and the arrow semantics cannot drift between them. Only the layout differs.
 *
 * Reads GET /api/courses/{courseId}/leaderboard via lib/studentCourseClient.ts's
 * loadCourseLeaderboard, same real data source as app/leaderboard/page.tsx — the two share the
 * courseId-keyed cache (lib/leaderboardStore.ts), so whichever loads first serves the other.
 * Picks the student's first enrolled course, since a "primary course" doesn't exist yet; a
 * student in several courses sees the same one here as the leaderboard page falls back to.
 * Records this render's ranks as the new previous-rank snapshot (lib/previousRankStore.ts) the
 * same way the full leaderboard page does, so a delta shown here and on /leaderboard afterwards
 * agrees rather than each keeping its own idea of "last visit".
 */
export function LeaderboardPreview({ token, studentId }: { token: string; studentId?: string }) {
  const [course, setCourse] = useState<LeaderboardCourse | null | undefined>(undefined);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadJoinableCourses(token).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setCourse(null);
        return;
      }
      const mine = result.data.courses.find((c) => c.alreadyMember);
      setCourse(mine ? { courseId: mine.id, courseName: mine.name } : null);
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!course) return;
    let cancelled = false;

    loadCourseLeaderboard(token, course.courseId).then((result) => {
      if (!cancelled && result.ok) setEntries(result.data.entries);
    });

    return () => {
      cancelled = true;
    };
  }, [token, course]);

  useEffect(() => {
    if (!course || !entries || entries.length === 0) return;
    recordLeaderboardRanks(course.courseId, entries);
  }, [course, entries]);

  if (course === undefined || (course && entries === null)) {
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

  return (
    <section className="mb-7 rounded-brand-lg bg-brand-navy p-6 text-brand-ink">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xl font-extrabold text-white">Leaderboard</h3>
        {course ? (
          <span className="text-xs font-bold uppercase tracking-wide text-brand-ink-muted">
            {course.courseName}
          </span>
        ) : null}
      </div>

      {!course ? (
        <p className="mb-4 text-sm font-semibold text-brand-ink-muted">
          Join a course to see how you compare with your classmates.
        </p>
      ) : rows.length === 0 ? (
        <p className="mb-4 text-sm font-semibold text-brand-ink-muted">
          No one in this course has completed an activity yet — be the first.
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
        href={course ? `/leaderboard?courseId=${encodeURIComponent(course.courseId)}` : '/courses'}
        className="block w-full rounded-brand-md border border-brand-teal py-2.5 text-center text-sm font-extrabold text-brand-teal transition hover:bg-brand-teal/10"
      >
        {course ? 'View full leaderboard →' : 'Browse courses'}
      </Link>
    </section>
  );
}
