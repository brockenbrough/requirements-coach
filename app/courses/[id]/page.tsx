'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { ActivityCard, type ActivityCardData } from '../../../components/ActivityCard';
import { ActivityCardSkeleton } from '../../../components/ActivityCardSkeleton';
import { ConfirmModal } from '../../../components/ConfirmModal';
import { CourseLeaderboard } from '../../../components/CourseLeaderboard';
import { deriveActivityCardStatus } from '../../../lib/activityCardStatus';
import { buildCustomActivityDefinition, getActivityByType, type ActivityDefinition, type Difficulty } from '../../../lib/activityContent';
import { loadAvailableActivities } from '../../../lib/activityDiscoveryClient';
import { loadCompletedAttempts, loadSessions, loadStudentTitles, type StudentTitle } from '../../../lib/sessionClient';
import { MAX_DIFFICULTY_LEVEL, nextDifficultyLevel } from '../../../lib/sessionRules';
import { leaveCourse, loadMyCourses } from '../../../lib/studentCourseClient';
import type { JoinableCourse } from '../../../lib/courseTypes';
import { useRequireRole } from '../../../lib/useRequireRole';

const SKELETON_COUNT = 3;

type CardData = {
  activity: ActivityCardData;
  activityType: string | null;
  running: { difficulty_level: number; answeredCount: number; questionCount: number } | null;
  best: { score: number; maxScore: number } | null;
};

/**
 * GitHub #583: two quizzes composed from the same catalog share an activityType, so a lookup keyed
 * on activityType alone would collide — the id used everywhere a running/completed session needs
 * to be matched back to one specific card.
 */
function runningKey(activityType: string, assembledQuizId: string | null | undefined): string {
  return `${activityType}:${assembledQuizId ?? 'none'}`;
}

/** Same lookup as app/activities/page.tsx used to have — see that file's git history. */
function titleEntryFor(titles: StudentTitle[] | null, activityType: string | null): StudentTitle | null {
  if (!titles || !activityType) return null;
  return titles.find((candidate) => candidate.activityType === activityType) ?? null;
}

function earnedTitle(entry: StudentTitle | null): string | null {
  if (!entry || entry.difficultyLevel === null) return null;
  return entry.title;
}

/**
 * GitHub #427: one course's quiz list for a student — the destination of "My Courses"
 * (app/activities/page.tsx) course cards. Mirrors that former flat-list page's own card-loading
 * recipe (deriveActivityCardStatus fed by loadSessions/loadCompletedAttempts/loadStudentTitles)
 * exactly, just scoped to this one course's activities (GET /api/activities?courseId=) instead of
 * every course the student is in — no new progress calculation, only a narrower activity list.
 *
 * Course display info (name/semester) comes from GET /api/courses/mine — the same source "My
 * Courses" itself uses — rather than a new endpoint. The quiz list's own 403 (not enrolled in
 * this course) is the authoritative access check; a course absent from that /mine list (e.g. a
 * stale/typo'd id) just leaves the header saying "This course" while the quiz list still 403s.
 */
export default function CourseQuizzesPage({ params }: { params: { id: string } }) {
  const { token, profile, loading, authorized } = useRequireRole('student');
  const router = useRouter();

  const [course, setCourse] = useState<JoinableCourse | null>(null);
  const [cards, setCards] = useState<CardData[] | null>(null);
  const [titles, setTitles] = useState<StudentTitle[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [titlesLoading, setTitlesLoading] = useState(true);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);

  async function handleLeave() {
    if (!token) return { ok: false as const, error: 'You must be signed in to leave a course.' };

    const result = await leaveCourse(token, params.id);
    if (!result.ok) return result;

    router.push('/activities');
    return result;
  }

  // Independent of the quiz-list effect below — a failure here just leaves the header saying
  // "This course" rather than blocking the quiz list, the same "each fetch failing costs only
  // itself" pattern the old activities page used for titles vs. cards.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    loadMyCourses(token).then((result) => {
      if (!cancelled && result.ok) {
        setCourse(result.data.courses.find((c) => c.id === params.id) ?? null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token, params.id, retryCount]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setIsLoading(true);
    setLoadStatus('loading');

    loadAvailableActivities(token, { courseId: params.id }).then((discoveryResult) => {
      if (cancelled) return;

      if (!discoveryResult.ok) {
        setLoadStatus(discoveryResult.status === 403 ? 'forbidden' : 'error');
        setIsLoading(false);
        return;
      }

      // GitHub #583: attach each entry's own assembledQuizId regardless of which path produced
      // the base definition — getActivityByType's built-in result carries none of its own (there
      // is no DB row behind a static entry), and two quizzes sharing a catalog must not collapse
      // into indistinguishable cards.
      const resolvedActivities: ActivityDefinition[] = discoveryResult.data.activities.map((entry) => {
        const base = getActivityByType(entry.activityType) ?? buildCustomActivityDefinition(entry);
        return { ...base, assembledQuizId: entry.assembledQuizId };
      });

      const attemptsPromises = profile
        ? resolvedActivities.map((activity) =>
            loadCompletedAttempts(token, profile.user_id, activity.activityType, {
              assembledQuizId: activity.assembledQuizId ?? undefined,
            }),
          )
        : resolvedActivities.map(() => Promise.resolve({ ok: true as const, data: { attempts: [] } }));

      Promise.all([loadSessions(token, 'in-progress'), ...attemptsPromises]).then(([sessionsResult, ...attemptResults]) => {
        if (cancelled) return;

        if (!sessionsResult.ok) {
          setLoadStatus('error');
          setIsLoading(false);
          return;
        }

        const runningByType = new Map(
          sessionsResult.data.sessions.map((session) => [runningKey(session.activity_type, session.assembled_quiz_id), session]),
        );

        const nextCards: CardData[] = resolvedActivities.map((activity, i) => {
          const attemptsResult = attemptResults[i];
          const attempts = attemptsResult.ok ? attemptsResult.data.attempts : [];
          const best = attempts.length === 0 ? null : attempts.reduce((b, a) => (a.score > b.score ? a : b), attempts[0]);
          const running = runningByType.get(runningKey(activity.activityType, activity.assembledQuizId)) ?? null;
          return {
            activity,
            activityType: activity.activityType,
            running,
            best: best ? { score: best.score, maxScore: best.maxScore } : null,
          };
        });

        setCards(nextCards);
        setLoadStatus('ok');
        setIsLoading(false);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [token, profile, params.id, retryCount]);

  useEffect(() => {
    if (!token || !profile?.user_id) {
      setTitlesLoading(false);
      return;
    }
    let cancelled = false;
    setTitlesLoading(true);

    loadStudentTitles(token, profile.user_id).then((result) => {
      if (cancelled) return;
      if (result.ok) setTitles(result.data.titles);
      setTitlesLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [token, profile?.user_id, retryCount]);

  if (loading || !authorized) return null;

  return (
    <AppShell active="activities">
      <div className="mx-auto max-w-4xl">
        <Link href="/activities" className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-brand-navy">
          ← Back to My Courses
        </Link>

        {loadStatus === 'forbidden' ? (
          <div className="rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-center">
            <p className="text-sm font-semibold text-brand-danger">You don&apos;t have access to this course.</p>
          </div>
        ) : loadStatus === 'error' ? (
          <div className="rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-center">
            <p className="mb-4 text-sm font-semibold text-brand-danger">Failed to load this course&apos;s quizzes.</p>
            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
              className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">{course?.name ?? 'This course'}</h1>
                {course?.semester ? (
                  <span className="inline-flex items-center rounded-full bg-brand-purple/10 px-2.5 py-0.5 text-xs font-bold text-brand-purple">
                    {course.semester}
                  </span>
                ) : null}
              </div>

              {course ? (
                <button
                  type="button"
                  onClick={() => setLeaveModalOpen(true)}
                  className="shrink-0 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-brand-danger transition hover:border-brand-danger/40 hover:bg-brand-danger/10"
                >
                  Leave course
                </button>
              ) : null}
            </div>

            <h3 className="mb-5 mt-6 text-lg font-extrabold text-brand-navy">Quizzes</h3>

            {isLoading || titlesLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" role="status" aria-label="Loading quizzes">
                {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                  <ActivityCardSkeleton key={i} />
                ))}
              </div>
            ) : cards && cards.length === 0 ? (
              <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-8 text-center text-sm font-semibold text-gray-500">
                No quizzes assigned to this course yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {cards?.map((card) => {
                  const titleEntry = titleEntryFor(titles, card.activityType);
                  const highestPassedLevel = titleEntry?.difficultyLevel ?? null;
                  const isMastered = highestPassedLevel === MAX_DIFFICULTY_LEVEL;

                  // Same derivation as the old activities page's card level — the running
                  // session's own level, else the level the student's next click would actually
                  // produce, so the card and the page it links into can't disagree.
                  const level = (card.running?.difficulty_level ?? nextDifficultyLevel(highestPassedLevel)) as Difficulty;

                  return (
                    <ActivityCard
                      key={runningKey(card.activity.slug, card.activity.assembledQuizId)}
                      activity={card.activity}
                      level={level}
                      title={earnedTitle(titleEntry)}
                      status={deriveActivityCardStatus(card.running, card.best, isMastered)}
                    />
                  );
                })}
              </div>
            )}

            {token ? <CourseLeaderboard token={token} courseId={params.id} studentId={profile?.user_id} /> : null}
          </>
        )}
      </div>

      {leaveModalOpen ? (
        <ConfirmModal
          kicker="Leave course"
          title={`Leave ${course?.name ?? 'this course'}?`}
          message="You can rejoin later with the course code."
          confirmLabel="Leave course"
          confirmingLabel="Leaving…"
          onClose={() => setLeaveModalOpen(false)}
          onConfirm={handleLeave}
        />
      ) : null}
    </AppShell>
  );
}
