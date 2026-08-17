"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../../../../components/AppShell";
import { FeedbackCard } from "../../../../components/FeedbackCard";
import { QuestionCard } from "../../../../components/QuestionCard";
import { SessionProgressDots, type ProgressDotStatus } from "../../../../components/SessionProgressDots";
import { SessionSummaryScreen, type SessionSummaryItem } from "../../../../components/SessionSummaryScreen";
import { clearCachedLeaderboard } from "../../../../lib/leaderboardStore";
import { isPassing } from "../../../../lib/sessionRules";
import {
  type CurrentSessionResult,
  type FeedbackResult,
  type SessionQuestion,
  loadCompletedAttempts,
  loadActivityLog,
  loadCurrentSession,
  loadFeedback,
  loadSessions,
  loadStudentScore,
  loadStudentTitles,
  submitAnswer,
} from "../../../../lib/sessionClient";
import { useRequireRole } from "../../../../lib/useRequireRole";
import { useResolvedActivity } from "../../../../lib/useResolvedActivity";
import { LlmPlayView } from "../../../../components/LlmPlayView";

/** What the last submitted answer earned, alongside the explanations for it. */
type AnswerOutcome = {
  question: SessionQuestion;
  feedback: FeedbackResult;
  awardedScore: number;
  completed: boolean;
};

/**
 * The multiple-choice play flow. Unchanged by GitHub #379 apart from no longer being the default
 * export — it now only ever mounts once the wrapper below has confirmed the activity is 'mcq',
 * which is what lets its body stay untouched instead of growing a second set of branches.
 */
function QuizPlayView({
  params,
}: {
  params: { slug: string };
}) {
  const router = useRouter();
  // Also redirects an instructor account away (GitHub #82) — this page is the "quiz
  // durchführen" flow itself, exactly what an instructor must not be able to reach.
  const { token, profile, loading, authorized } = useRequireRole("student");
  const { activity, status: activityStatus } = useResolvedActivity(token, params.slug);

  const [session, setSession] = useState<CurrentSessionResult | null>(null);
  const [nextPosition, setNextPosition] = useState<number | null>(null);
  const [cumulativeScore, setCumulativeScore] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [outcome, setOutcome] = useState<AnswerOutcome | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // REQ-GAM-PL-2.4: the highest difficulty level already passed for this activity type before
  // this session could complete — undefined until loaded, null meaning "none yet" (same meaning
  // as StudentTitle.difficultyLevel). Captured once so a retake of an already-passed level
  // (titleAtStart === this session's level) never reads as a new title.
  const [titleAtStart, setTitleAtStart] = useState<number | null | undefined>(undefined);
  const [titleEarned, setTitleEarned] = useState<{ title: string; activityName: string } | null>(null);

  /**
   * The server is the only source of progress — there is no stored "current question",
   * it is derived from which of the drawn questions have an answer logged. So resuming,
   * reloading, and recovering from a double submit are all the same read.
   *
   * GitHub #263 bug fix: skipped while showSummary is true. A finished session is no longer
   * "current" server-side (GET .../current only ever answers for an in-progress one), so
   * re-syncing at that point doesn't refresh anything — it finds session: null and immediately
   * navigates away, discarding the summary the student hasn't dismissed yet. This can happen
   * without any explicit reload: syncFromServer's identity changes whenever token does, and
   * UserProvider refreshes the token on its own 45-minute timer.
   */
  const syncFromServer = useCallback(async () => {
    if (!token || !activity || showSummary) return;

    const result = await loadCurrentSession(token, activity.activityType);

    if (!result.ok) {
      // The session expired mid-play: back to login, not a dead-end error screen.
      if (result.status === 401) {
        router.replace("/login");
        return;
      }
      setError(result.error);
      return;
    }

    // Nothing running: the student got here without starting, or already finished.
    if (!result.data.session) {
      router.replace(`/activities/${activity.slug}`);
      return;
    }

    setSession(result.data);
    setNextPosition(result.data.nextPosition);
    setCumulativeScore(result.data.session.cumulative_score);
    setAnsweredCount(result.data.answers.length);
    setOutcome(null);
  }, [token, activity, router, showSummary]);

  useEffect(() => {
    void syncFromServer();
  }, [syncFromServer]);

  // REQ-GAM-PL-2.4: fetched once per mount, well before a 4-question session can finish, so it
  // reflects the student's title *before* this attempt — never re-derived from this session's
  // own outcome, which is what tells a newly-earned title apart from a retake.
  useEffect(() => {
    if (!token || !profile?.user_id || !activity) return;
    let cancelled = false;
    void loadStudentTitles(token, profile.user_id).then((result) => {
      if (cancelled || !result.ok) return;
      const entry = result.data.titles.find((t) => t.activityType === activity.activityType);
      setTitleAtStart(entry?.difficultyLevel ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [token, profile?.user_id, activity]);

  if (loading || !authorized) return null;

  if (activityStatus === 'loading') return null;

  if (!activity) {
    return (
      <AppShell active="activities">
        <div className="mx-auto max-w-xl rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-sm font-semibold text-brand-danger-light">
          {activityStatus === 'forbidden'
            ? "You're not enrolled in a course that offers this activity."
            : "This activity doesn't exist."}
          <Link href="/activities" className="ml-1 underline hover:text-white">
            Back to Activities
          </Link>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell active="activities">
        <div className="mx-auto max-w-xl rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-sm font-semibold text-brand-danger-light">
          {error}
          <Link
            href={`/activities/${activity.slug}`}
            className="ml-1 underline hover:text-white"
          >
            Back to the activity
          </Link>
        </div>
      </AppShell>
    );
  }

  if (!session?.session) return null;

  const questions = session.questions;
  const totalQuestions = questions.length;
  const currentQuestion = outcome
    ? outcome.question
    : questions.find((question) => question.position === nextPosition);

  async function handleAnswer(answerId: string) {
    if (!token || submitting || !currentQuestion) return;

    const sessionId = session!.session!.session_id;
    setSubmitting(true);

    const submitted = await submitAnswer(
      token,
      sessionId,
      currentQuestion.question_id,
      answerId,
    );

    if (!submitted.ok) {
      setSubmitting(false);
      // Already answered — another tab or device got there first. The server's version
      // wins, so re-read instead of reporting a conflict the student cannot act on.
      if (submitted.status === 409) {
        await syncFromServer();
        return;
      }
      // The session expired mid-answer: back to login, not a dead-end error screen.
      if (submitted.status === 401) {
        router.replace("/login");
        return;
      }
      setError(submitted.error);
      return;
    }

    // The activity log's answeredCount for this session is now stale, whether or not this
    // was the final question — refresh regardless of handleContinue's own score/completed-
    // sessions refresh, which only fires once the whole session is done.
    if (profile?.user_id) {
      void loadActivityLog(token, profile.user_id, { forceRefresh: true });
    }

    // Committed first, disclosed second: the explanations only exist for an answer that
    // is already in the log, which is why this is a second call rather than one response.
    const feedback = await loadFeedback(
      token,
      sessionId,
      currentQuestion.question_id,
      answerId,
    );
    setSubmitting(false);

    if (!feedback.ok) {
      setError(feedback.error);
      return;
    }

    setCumulativeScore(submitted.data.session.cumulative_score);
    setAnsweredCount(submitted.data.answeredCount);
    setNextPosition(submitted.data.nextPosition);
    setOutcome({
      question: currentQuestion,
      feedback: feedback.data,
      awardedScore: submitted.data.score,
      completed: submitted.data.completed,
    });
  }

  async function handleContinue() {
    if (!outcome) return;

    // GitHub #236: fold the just-graded answer into session.answers before dropping the
    // feedback view — that's what lets the progress dots (and, once the session is done, the
    // GitHub #263 summary) know this question's correctness once it stops being "current".
    // Built entirely from outcome (already-fetched, real data from the submit/feedback round
    // trip), not a second network call or a new parallel state. Needed for both branches below
    // now — completed or not, this question's result must be in session.answers.
    setSession((current) =>
      current
        ? {
            ...current,
            answers: [
              ...current.answers,
              {
                question_id: outcome.question.question_id,
                submitted_option: outcome.feedback.selectedOption.answerId,
                score: outcome.awardedScore,
                submitted_at: outcome.feedback.submittedAt,
                correct: outcome.feedback.correct,
                explanation: outcome.feedback.selectedOption.explanation,
              },
            ],
          }
        : current,
    );

    if (outcome.completed) {
      // REQ-GAM-PL-2.4/2.5: a new title only exists if this session passed *and* its
      // difficulty level beats whatever was already passed before this attempt started —
      // otherwise this is a retake of an already-mastered level, not a new title.
      const passed = isPassing(cumulativeScore, session!.session!.max_score);
      if (
        passed &&
        titleAtStart !== undefined &&
        (titleAtStart === null || outcome.question.difficulty_level > titleAtStart) &&
        token &&
        profile?.user_id
      ) {
        const titlesResult = await loadStudentTitles(token, profile.user_id);
        if (titlesResult.ok) {
          const earned = titlesResult.data.titles.find(
            (t) => t.activityType === activity!.activityType,
          );
          if (earned?.title) {
            setTitleEarned({ title: earned.title, activityName: activity!.name });
          }
        }
      }

      // GitHub #263: show the session summary instead of navigating away immediately — the
      // cache refresh + navigation that used to happen right here now happens once the student
      // dismisses the summary, in handleFinishSummary.
      setOutcome(null);
      setShowSummary(true);
      return;
    }

    // The whole draw is already in hand — advancing is just dropping the feedback view.
    setOutcome(null);
  }

  async function handleFinishSummary() {
    if (token && profile?.user_id) {
      // Await the completed-attempts refresh before navigating so the activity
      // page's cache is already up to date when it mounts — without this the
      // "previous attempts" table still shows the stale list (GitHub #130).
      await Promise.all([
        loadStudentScore(token, profile.user_id, { forceRefresh: true }),
        loadSessions(token, "completed", {
          studentId: profile.user_id,
          forceRefresh: true,
        }),
        loadCompletedAttempts(token, profile.user_id, activity!.activityType, {
          forceRefresh: true,
        }),
      ]);
    }
    // The score that just changed is the same cumulative score every course leaderboard the
    // student is in ranks by — a completed session can move their rank on any of them. There is
    // no cheap way from here to know which course(s), so the whole cache is cleared (like the
    // caches above, not awaited: nothing on this page reads it, only the leaderboard page and
    // preview do, on their own next mount) rather than a targeted, per-course forceRefresh.
    clearCachedLeaderboard();
    router.push(`/activities/${activity!.slug}`);
  }

  // Once the session is complete, currentQuestion legitimately becomes undefined (nextPosition
  // is null server-side, nothing left to draw) — that's expected while showSummary is up, not
  // a "got here without starting" case, so it must not hit the same early-out.
  if (!currentQuestion && !showSummary) return null;

  const { feedback } = outcome ?? {};
  const answeredDots = outcome ? answeredCount - 1 : answeredCount;
  // Position is 1-indexed and dot index i is 0-indexed, so sort explicitly rather than assume
  // the API already returned questions in position order — dot i must line up with position i+1
  // for the per-question correctness lookup below to point at the right answer.
  const dotQuestions = [...questions].sort((a, b) => a.position - b.position);
  const dotStatuses: ProgressDotStatus[] = dotQuestions.map((question, i) => {
    if (i === answeredDots) return "current";
    if (i >= answeredDots) return "upcoming";
    // GitHub #236: correctness for an already-answered question comes from session.answers —
    // kept accurate across "Next question" clicks by handleContinue above, so no separate
    // per-question tracking is needed here.
    const isCorrect = session.answers.find((a) => a.question_id === question.question_id)?.correct === true;
    return isCorrect ? "correct" : "incorrect";
  });

  // GitHub #263: SessionSummaryScreen is generic (score/message/items) — this page maps its
  // own points-and-correctness session into that shape, the same division of responsibility as
  // components/LlmPlayView.tsx does for its 1-10 LLM scores. isPassing (lib/sessionRules.ts)
  // is the same formula the server uses for session_log.passed, so the two can't disagree.
  const maxScore = session.session.max_score;
  const correctCount = session.answers.filter((answer) => answer.correct).length;
  const sessionPassed = isPassing(cumulativeScore, maxScore);
  const summaryMessage = sessionPassed
    ? `Great job — you passed with ${correctCount} of ${totalQuestions} correct!`
    : `Keep practicing — ${correctCount} of ${totalQuestions} correct this time.`;
  const summaryItems: SessionSummaryItem[] = dotQuestions.map((question) => {
    const answer = session.answers.find((a) => a.question_id === question.question_id);
    return {
      key: question.question_id,
      label: question.question_prompt,
      scoreLabel: answer ? `${answer.score} pts` : "—",
      passed: answer?.correct === true,
    };
  });

  return (
    <AppShell active="activities">
      <div className="mx-auto max-w-xl">
        {!showSummary ? (
          <div className="mb-5 flex items-center justify-between">
            <SessionProgressDots statuses={dotStatuses} />
            <span className="text-sm font-bold text-gray-500">
              Question {Math.min(answeredDots + 1, totalQuestions)} of{" "}
              {totalQuestions} · {cumulativeScore} pts
            </span>
          </div>
        ) : null}

        {showSummary ? (
          <SessionSummaryScreen
            scoreValue={cumulativeScore}
            scoreMax={maxScore}
            message={summaryMessage}
            items={summaryItems}
            onDone={handleFinishSummary}
            titleNotification={titleEarned}
          />
        ) : outcome && feedback ? (
          <>
            <FeedbackCard
              prompt={outcome.question.question_prompt}
              options={outcome.question.options}
              selectedAnswerId={feedback.selectedOption.answerId}
              // The route only sends correctOption when the pick was wrong — a correct
              // pick is its own correct option.
              correctAnswerId={
                feedback.correctOption?.answerId ??
                feedback.selectedOption.answerId
              }
              selectedExplanation={feedback.selectedOption.explanation}
              correctExplanation={
                feedback.correctOption?.explanation ??
                feedback.selectedOption.explanation
              }
              awardedScore={outcome.awardedScore}
              isCorrect={feedback.correct}
            />
            <div className="mt-5 flex justify-end">
              <button
                onClick={handleContinue}
                className="rounded-full bg-[#7C4DFF] px-6 py-3 text-sm font-extrabold text-white hover:bg-[#6234d1]"
              >
                {outcome.completed ? "Finish" : "Next question"} →
              </button>
            </div>
          </>
        ) : currentQuestion ? (
          // Keyed so a change of question remounts the card and clears its selection —
          // otherwise the re-sync after a 409 would leave the previous pick staged.
          <QuestionCard
            key={currentQuestion.question_id}
            question={currentQuestion}
            disabled={submitting}
            onSubmit={handleAnswer}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

/**
 * GitHub #379: resolves the slug once and hands off to the play flow its grading kind calls for.
 *
 * The branch lives here, above both views, rather than inside one of them, for two reasons: hooks
 * cannot be called conditionally, and mounting the MCQ view for an LLM-graded activity — even for
 * a single render — would fire its loadCurrentSession against the wrong session model. So neither
 * view mounts until the kind is actually known.
 *
 * QuizPlayView resolves the slug a second time internally. That is deliberate: for the built-in
 * slugs useResolvedActivity answers synchronously from the static ACTIVITIES array at zero network
 * cost, and paying one extra fetch in the custom-catalog case is cheaper than threading the
 * resolved activity through a body this issue is otherwise not touching at all.
 */
export default function PlayActivityPage({
  params,
}: {
  params: { slug: string };
}) {
  const { token, loading, authorized } = useRequireRole("student");
  const { activity, status: activityStatus } = useResolvedActivity(token, params.slug);

  if (loading || !authorized) return null;
  if (activityStatus === 'loading') return null;

  if (!activity) {
    return (
      <AppShell active="activities">
        <div className="mx-auto max-w-xl rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-sm font-semibold text-brand-danger-light">
          {activityStatus === 'forbidden'
            ? "You're not enrolled in a course that offers this activity."
            : "This activity doesn't exist."}
          <Link href="/activities" className="ml-1 underline hover:text-white">
            Back to Activities
          </Link>
        </div>
      </AppShell>
    );
  }

  return activity.gradingKind === 'llm-graded' ? (
    <LlmPlayView activity={activity} />
  ) : (
    <QuizPlayView params={params} />
  );
}
