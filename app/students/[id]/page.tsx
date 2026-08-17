'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { Avatar } from '../../../components/Avatar';
import { EditableField } from '../../../components/EditableField';
import { MasteryTitleCard } from '../../../components/MasteryTitleCard';
import { StatTile } from '../../../components/StatTile';
import { useUser } from '../../../components/UserProvider';
import { buildMasteryTitleEntries, totalLevelsPassed } from '../../../lib/masteryTitles';
import type { AvailableActivityTitles, PublicStudentProfile, PublicStudentTitle } from '../../../lib/leaderboardTypes';
import {
  loadAvailableTitles,
  loadPublicStudentProfile,
  loadStudentScore,
  loadStudentTitles,
} from '../../../lib/sessionClient';
import { useRequireRole } from '../../../lib/useRequireRole';

/**
 * A classmate's profile, reached by clicking a username on the leaderboard or the dashboard
 * preview. Read-only — there is nothing on this page a viewer can change.
 *
 * PRIVACY CONTRACT. Shown: username, avatar, biography, cumulative score, earned mastery titles.
 * Deliberately NOT shown: real name, age, semester, email, course list, individual answers,
 * attempt history. GET /api/students/{id}/public-profile (US-5) returns only the fields above —
 * this page not rendering a field is not a substitute for the route not sending it, and a route
 * that over-returns leaks the data into the network tab regardless of the markup.
 */
export default function StudentProfilePage({ params }: { params: { id: string } }) {
  return <StudentProfileContent studentId={params.id} />;
}

function NotFoundCard() {
  return (
    <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-8 text-center">
      <p className="text-sm font-extrabold text-brand-navy">Student not found.</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm font-semibold text-gray-500">
        This profile doesn&apos;t exist, or the student is no longer in your course.
      </p>
      {/* No Retry button, unlike the failed-fetch cards elsewhere: an unknown id will not
          resolve on a second attempt, so offering one would only waste a click. */}
      <Link
        href="/leaderboard"
        className="mt-4 inline-flex rounded-brand-md bg-brand-purple px-4 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
      >
        Back to Leaderboard
      </Link>
    </div>
  );
}

function StudentProfileContent({ studentId }: { studentId: string }) {
  // Instructors are redirected away: this page exists so students can compare themselves with
  // classmates, and an instructor already has the far richer /instructor/students/{id} view.
  const { loading, authorized } = useRequireRole('student');
  const { token, profile: ownProfile } = useUser();

  const isSelf = Boolean(ownProfile) && studentId === ownProfile?.user_id;

  /**
   * Score and mastery titles for your own profile, from the two self-only routes that already
   * exist. Without this the self view would claim a score of 0 while the sidebar shows the real
   * number — the mock has no entry to fall back on here, since the id is a real uuid (below).
   *
   * Nothing equivalent runs for a peer: /score and /titles hard-403 on a foreign id by design.
   * US-5's public-profile route is what will serve those two numbers for someone else.
   */
  const [ownScore, setOwnScore] = useState(0);
  const [ownTitles, setOwnTitles] = useState<PublicStudentTitle[]>([]);
  const [ownAvailableTitles, setOwnAvailableTitles] = useState<AvailableActivityTitles[]>([]);

  useEffect(() => {
    if (!isSelf || !token || !ownProfile) return;
    let cancelled = false;

    Promise.all([
      // onRevalidate (GitHub #392 follow-up, same as UserProvider's own score load): corrects a
      // stale cached score in the background if the server disagrees, rather than leaving this
      // page stuck on a wrong number until the student finishes another session or logs out.
      loadStudentScore(token, ownProfile.user_id, {
        onRevalidate: (fresh) => {
          if (!cancelled) setOwnScore(fresh.score);
        },
      }),
      loadStudentTitles(token, ownProfile.user_id),
      loadAvailableTitles(token, ownProfile.user_id),
    ]).then(([scoreResult, titlesResult, availableResult]) => {
      if (cancelled) return;
      if (scoreResult.ok) setOwnScore(scoreResult.data.score);
      if (titlesResult.ok) setOwnTitles(titlesResult.data.titles);
      if (availableResult.ok) setOwnAvailableTitles(availableResult.data.activities);
    });

    return () => {
      cancelled = true;
    };
  }, [isSelf, token, ownProfile]);

  /**
   * A peer's profile via the real GET /api/students/{id}/public-profile (US-5) — 403s unless the
   * caller shares a course with them, 404 for an unknown id, both of which collapse to `null`
   * here (NotFoundCard doesn't distinguish the two; see that component's own copy).
   *
   * Gated on `!loading` (not just `!isSelf`): ownProfile is also `null` for an instant while
   * useUser() is still resolving, which would otherwise make isSelf false and fire a wasted (or
   * for the self case, wrong) fetch before isSelf has settled.
   *
   * undefined means "not fetched yet", distinct from null ("fetched, doesn't exist / forbidden")
   * — collapsed into the same profileLoading flag as the self branch below.
   */
  const [peerProfile, setPeerProfile] = useState<PublicStudentProfile | null | undefined>(undefined);

  useEffect(() => {
    if (loading || isSelf || !token) return;
    let cancelled = false;
    setPeerProfile(undefined);

    loadPublicStudentProfile(token, studentId).then((result) => {
      if (cancelled) return;
      setPeerProfile(result.ok ? result.data : null);
    });

    return () => {
      cancelled = true;
    };
  }, [loading, isSelf, token, studentId]);

  const profileLoading = !loading && !isSelf && peerProfile === undefined;

  const profile: PublicStudentProfile | null = useMemo(() => {
    if (isSelf) {
      return ownProfile
        ? {
            studentId: ownProfile.user_id,
            username: ownProfile.username,
            avatarUrl: ownProfile.avatar_url,
            biography: ownProfile.biography,
            selectedTitle: ownProfile.selected_title?.title_name ?? null,
            score: ownScore,
            titles: ownTitles,
            availableTitles: ownAvailableTitles,
          }
        : null;
    }
    return peerProfile ?? null;
  }, [isSelf, ownProfile, ownScore, ownTitles, ownAvailableTitles, peerProfile]);

  const masteryEntries = useMemo(
    () => (profile ? buildMasteryTitleEntries(profile.availableTitles, profile.titles) : []),
    [profile],
  );
  // "Earned" is the word in the story: a stranger's unreached levels aren't interesting, unlike
  // on your own profile, where MasteryProgressSection deliberately shows all three as a to-do.
  const earnedEntries = masteryEntries.filter((entry) => entry.currentLevel !== null);

  // The redirect in useRequireRole runs in an effect, so rendering before it lands would flash
  // this page at an instructor.
  if (loading || !authorized) return null;

  return (
    <AppShell active="leaderboard">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/leaderboard"
          className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-brand-navy"
        >
          ← Back to Leaderboard
        </Link>

        {profileLoading ? (
          <p className="py-8 text-center text-sm font-semibold text-gray-500">Loading profile…</p>
        ) : !profile ? (
          <NotFoundCard />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <Avatar avatarUrl={profile.avatarUrl} fallbackName={profile.username} size="xl" />
              <div className="min-w-0">
                <h1 className="break-words text-2xl font-extrabold text-brand-navy">{profile.username}</h1>
                {profile.selectedTitle ? (
                  <p className="mt-0.5 text-sm font-bold text-brand-purple">{profile.selectedTitle}</p>
                ) : null}
                {isSelf ? (
                  <p className="mt-1 text-sm font-semibold text-gray-500">
                    This is you —{' '}
                    <Link href="/profile" className="font-extrabold text-brand-purple hover:underline">
                      edit your profile
                    </Link>
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <StatTile value={profile.score} label="Cumulative score" />
              <StatTile value={totalLevelsPassed(masteryEntries)} label="Levels passed" />
            </div>

            {/* editing={false} makes EditableField a plain read-only label/value block, including
                its own empty-value copy — no second way of rendering a biography. */}
            <div className="mt-6">
              <EditableField
                label="Biography"
                value={profile.biography}
                editing={false}
                emptyText="No biography yet."
              />
            </div>

            <div className="mt-8 border-t border-gray-100 pt-6">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Mastery titles</p>
              {earnedEntries.length === 0 ? (
                <p className="mt-3 text-sm font-semibold text-gray-500">
                  {isSelf
                    ? 'No mastery titles yet — pass a level to earn your first.'
                    : 'No mastery titles yet.'}
                </p>
              ) : (
                <div className="mt-3 space-y-4">
                  {earnedEntries.map((entry) => (
                    <MasteryTitleCard key={entry.activityType} entry={entry} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
