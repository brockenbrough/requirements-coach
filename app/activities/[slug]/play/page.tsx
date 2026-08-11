"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../../../../components/AppShell";
import { FeedbackCard } from "../../../../components/FeedbackCard";
import { QuestionCard } from "../../../../components/QuestionCard";
import { getActivity } from "../../../../lib/activityContent";
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
  submitAnswer,
} from "../../../../lib/sessionClient";
import { useRequireRole } from "../../../../lib/useRequireRole";

/** What the last submitted answer earned, alongside the explanations for it. */
type AnswerOutcome = {
  question: SessionQuestion;
  feedback: FeedbackResult;
  awardedScore: number;
  completed: boolean;
};

export default function PlayActivityPage({
  params,
}: {
  params: { slug: string };
}) {
  const router = useRouter();
  // Also redirects an instructor account away (GitHub #82) — this page is the "quiz
  // durchführen" flow itself, exactly what an instructor must not be able to reach.
  const { token, profile, loading, authorized } = useRequireRole("student");
  const activity = getActivity(params.slug);

  const [session, setSession] = useState<CurrentSessionResult | null>(null);
  const [nextPosition, setNextPosition] = useState<number | null>(null);
  const [cumulativeScore, setCumulativeScore] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [outcome, setOutcome] = useState<AnswerOutcome | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The server is the only source of progress — there is no stored "current question",
   * it is derived from which of the drawn questions have an answer logged. So resuming,
   * reloading, and recovering from a double submit are all the same read.
   */
  const syncFromServer = useCallback(async () => {
    if (!token || !activity) return;

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
  }, [token, activity, router]);

  useEffect(() => {
    void syncFromServer();
  }, [syncFromServer]);

  if (loading || !authorized) return null;

  if (!activity) return null;

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
    if (outcome.completed) {
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
      router.push(`/activities/${activity!.slug}`);
      return;
    }

    // GitHub #236: fold the just-graded answer into session.answers before dropping the
    // feedback view — that's what lets the progress dots know this question's correctness
    // once it stops being "current". Built entirely from outcome (already-fetched, real data
    // from the submit/feedback round trip), not a second network call or a new parallel state.
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
    // The whole draw is already in hand — advancing is just dropping the feedback view.
    setOutcome(null);
  }

  if (!currentQuestion) return null;

  const { feedback } = outcome ?? {};
  const answeredDots = outcome ? answeredCount - 1 : answeredCount;
  // Position is 1-indexed and dot index i is 0-indexed, so sort explicitly rather than assume
  // the API already returned questions in position order — dot i must line up with position i+1
  // for the per-question correctness lookup below to point at the right answer.
  const dotQuestions = [...questions].sort((a, b) => a.position - b.position);

  return (
    <AppShell active="activities">
      <div className="mx-auto max-w-xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {dotQuestions.map((question, i) => {
              const isCurrent = i === answeredDots;
              const isAnswered = i < answeredDots;
              // GitHub #236: correctness for an already-answered question comes from
              // session.answers — kept accurate across "Next question" clicks by handleContinue
              // above, so no separate per-question tracking is needed here.
              const isCorrect = isAnswered && session.answers.find((a) => a.question_id === question.question_id)?.correct === true;

              return (
                <span
                  key={question.question_id}
                  className={`rounded-full transition-all duration-300 ${
                    isCurrent
                      ? "h-3 w-3 bg-brand-purple"
                      : isAnswered
                        ? `h-2 w-2 ${isCorrect ? "bg-brand-green" : "bg-brand-danger"}`
                        : "h-2 w-2 bg-brand-navy-border"
                  }`}
                />
              );
            })}
          </div>
          <span className="text-sm font-bold text-gray-500">
            Question {Math.min(answeredDots + 1, totalQuestions)} of{" "}
            {totalQuestions} · {cumulativeScore} pts
          </span>
        </div>

        {outcome && feedback ? (
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
        ) : (
          // Keyed so a change of question remounts the card and clears its selection —
          // otherwise the re-sync after a 409 would leave the previous pick staged.
          <QuestionCard
            key={currentQuestion.question_id}
            question={currentQuestion}
            disabled={submitting}
            onSubmit={handleAnswer}
          />
        )}
      </div>
    </AppShell>
  );
}
