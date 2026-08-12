'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Avatar } from './Avatar';
import { LeaderboardRankBadge } from './LeaderboardRankBadge';
import { RankChangeIndicator } from './RankChangeIndicator';
import { getMockCourses, getMockLeaderboard } from '../lib/mockLeaderboard';
import type { LeaderboardEntry } from '../lib/leaderboardTypes';

const TOP_COUNT = 5;

function PreviewRow({ entry, isCurrentUser }: { entry: LeaderboardEntry; isCurrentUser: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-brand-md px-2 py-2 ${
        isCurrentUser ? 'bg-brand-purple/20' : ''
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
 * Phase 1: reads lib/mockLeaderboard.ts synchronously, and picks the student's first course
 * because a "primary course" doesn't exist yet. The real version fetches
 * GET /api/courses/{courseId}/leaderboard and will need an answer for which course a student
 * enrolled in several should see here — likely their most recently active one.
 */
export function LeaderboardPreview({ studentId }: { studentId?: string }) {
  const course = useMemo(() => getMockCourses()[0] ?? null, []);
  const entries = useMemo(
    () => (course ? getMockLeaderboard(course.courseId, studentId) : []),
    [course, studentId],
  );

  const top = entries.slice(0, TOP_COUNT);
  const me = entries.find((entry) => entry.studentId === studentId) ?? null;
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
      ) : entries.length === 0 ? (
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
