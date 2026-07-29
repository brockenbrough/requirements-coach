'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { getActivity } from '../../../lib/activityContent';
import { abandonSession, ActivityState, getActivityState, startSession } from '../../../lib/activityStore';
import { useAccessToken } from '../../../lib/useAccessToken';

const DIFFICULTY_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' } as const;

export default function ActivityDetailPage({ params }: { params: { slug: string } }) {
  const router = useRouter();
  const { token, loading } = useAccessToken();
  const activity = getActivity(params.slug);
  const [state, setState] = useState<ActivityState | null>(null);

  useEffect(() => {
    if (!token || !activity) return;
    setState(getActivityState(activity.slug));
  }, [token, activity]);

  if (loading) return null;

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0e0b1e] px-6 text-center text-[#F3F1FF]">
        <div>
          <p className="mb-4">You must be logged in to view this activity.</p>
          <Link href="/login" className="rounded-full bg-[#7C4DFF] px-4 py-2 text-sm font-bold text-white">
            Go to login
          </Link>
        </div>
      </main>
    );
  }

  if (!activity) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0e0b1e] px-6 text-center text-[#F3F1FF]">
        <div>
          <p className="mb-4">Unknown activity.</p>
          <Link href="/activities" className="rounded-full bg-[#7C4DFF] px-4 py-2 text-sm font-bold text-white">
            Back to activities
          </Link>
        </div>
      </main>
    );
  }

  function handleStart() {
    startSession(activity!.slug);
    router.push(`/activities/${activity!.slug}/play`);
  }

  function handleAbandon() {
    if (!confirm('Abandon this in-progress attempt? Your answers so far will be discarded.')) return;
    setState(abandonSession(activity!.slug));
  }

  return (
    <AppShell active="activities">
      <div className="mx-auto max-w-lg">
        <Link href="/activities" className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-[#1B1642]">
          ← Back to Activities
        </Link>

        <div className="rounded-2xl border border-[#332b6b] bg-[#1b1642] p-8 text-[#F3F1FF]">
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-extrabold text-[#2DD4BF]">
              {state ? DIFFICULTY_LABEL[state.level] : ''} · Level {state?.level ?? 1}
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-[#A79FC9]">{activity.category}</span>
          </div>
          <h2 className="mb-2 text-2xl font-extrabold text-white">{activity.name}</h2>
          <p className="mb-6 text-sm font-semibold text-[#A79FC9]">{activity.instructions}</p>

          {state?.inProgress ? (
            <>
              <div className="mb-6 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#241f52]">
                  <span
                    className="block h-full bg-[#2DD4BF]"
                    style={{ width: `${(state.inProgress.answeredIds.length / state.inProgress.questionIds.length) * 100}%` }}
                  />
                </div>
                <span className="whitespace-nowrap text-sm font-extrabold text-[#A79FC9]">
                  {state.inProgress.answeredIds.length} / {state.inProgress.questionIds.length} answered
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => router.push(`/activities/${activity.slug}/play`)}
                  className="rounded-full bg-[#7C4DFF] px-6 py-3 text-sm font-extrabold text-white hover:bg-[#6234d1]"
                >
                  Resume
                </button>
                <button
                  onClick={handleAbandon}
                  className="rounded-full border border-[#ff6b57]/40 bg-[#ff6b57]/10 px-6 py-3 text-sm font-extrabold text-[#ff8a75]"
                >
                  Abandon
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={handleStart}
              className="rounded-full bg-[#7C4DFF] px-6 py-3 text-sm font-extrabold text-white hover:bg-[#6234d1]"
            >
              Start
            </button>
          )}
        </div>

        {state && state.history.length > 0 ? (
          <div className="mt-6 overflow-hidden rounded-2xl border border-[#332b6b]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1b1642] text-[#A79FC9]">
                  <th className="px-4 py-2.5 text-left font-bold">Date</th>
                  <th className="px-4 py-2.5 text-left font-bold">Level</th>
                  <th className="px-4 py-2.5 text-left font-bold">Score</th>
                  <th className="px-4 py-2.5 text-left font-bold">Result</th>
                </tr>
              </thead>
              <tbody>
                {state.history.map((entry, i) => (
                  <tr key={i} className="border-t border-[#332b6b] bg-[#241f52] text-[#F3F1FF]">
                    <td className="px-4 py-2.5">{new Date(entry.completedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5">
                      {DIFFICULTY_LABEL[entry.level]} · {entry.level}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {entry.score} / {entry.maxScore}
                    </td>
                    <td className="px-4 py-2.5">{entry.passed ? 'Passed' : 'Not passed'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
