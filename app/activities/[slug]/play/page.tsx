'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../../components/AppShell';
import { FeedbackCard } from '../../../../components/FeedbackCard';
import { QuestionCard } from '../../../../components/QuestionCard';
import { getActivity, getQuestion } from '../../../../lib/activityContent';
import { ActivityState, answerQuestion, currentQuestionId, getActivityState } from '../../../../lib/activityStore';
import { useAccessToken } from '../../../../lib/useAccessToken';

export default function PlayActivityPage({ params }: { params: { slug: string } }) {
  const router = useRouter();
  const { token, loading } = useAccessToken();
  const activity = getActivity(params.slug);
  const [state, setState] = useState<ActivityState | null>(null);
  const [result, setResult] = useState<ReturnType<typeof answerQuestion> | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!token || !activity) return;
    const loaded = getActivityState(activity.slug);
    if (!loaded.inProgress) {
      router.replace(`/activities/${activity.slug}`);
      return;
    }
    setState(loaded);
    setChecked(true);
  }, [token, activity, router]);

  if (loading || (token && activity && !checked)) return null;

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0e0b1e] px-6 text-center text-[#F3F1FF]">
        <div>
          <p className="mb-4">You must be logged in to play this activity.</p>
          <Link href="/login" className="rounded-full bg-[#7C4DFF] px-4 py-2 text-sm font-bold text-white">
            Go to login
          </Link>
        </div>
      </main>
    );
  }

  if (!activity || !state?.inProgress) return null;

  const { inProgress } = state;
  const totalQuestions = inProgress.questionIds.length;
  const answeredCount = inProgress.answeredIds.length;

  function handleAnswer(optionId: string) {
    const r = answerQuestion(activity!.slug, optionId);
    setResult(r);
    setState(r.state);
  }

  function handleContinue() {
    if (!result) return;
    if (result.isComplete) {
      router.push(`/activities/${activity!.slug}`);
    } else {
      setResult(null);
    }
  }

  const currentQid = result ? result.question.id : currentQuestionId(state);
  const question = currentQid ? getQuestion(activity, currentQid) : undefined;
  if (!question) return null;

  return (
    <AppShell active="activities">
      <div className="mx-auto max-w-xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex gap-1.5">
            {Array.from({ length: totalQuestions }).map((_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full ${
                  i < answeredCount ? 'bg-[#2DD4BF]' : i === answeredCount ? 'bg-[#7C4DFF]' : 'bg-[#332b6b]'
                }`}
              />
            ))}
          </div>
          <span className="text-sm font-bold text-gray-500">
            Question {Math.min(answeredCount + 1, totalQuestions)} of {totalQuestions} · {inProgress.cumulativeScore} pts
          </span>
        </div>

        {result ? (
          <>
            <FeedbackCard
              question={result.question}
              selectedOptionId={result.selected.id}
              awardedScore={result.selected.score}
              isCorrect={result.correct}
            />
            <div className="mt-5 flex justify-end">
              <button
                onClick={handleContinue}
                className="rounded-full bg-[#7C4DFF] px-6 py-3 text-sm font-extrabold text-white hover:bg-[#6234d1]"
              >
                {result.isComplete ? 'Finish' : 'Next question'} →
              </button>
            </div>
          </>
        ) : (
          <QuestionCard question={question} onSubmit={handleAnswer} />
        )}
      </div>
    </AppShell>
  );
}
