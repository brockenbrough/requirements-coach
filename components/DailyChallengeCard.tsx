'use client';

import Link from 'next/link';
import { dailyChallengeCardStatusLabel, deriveDailyChallengeCardStatus } from '../lib/dailyChallengeStatus';
import type { DailyChallengeState } from '../lib/dailyChallengeTypes';

/**
 * The dashboard's Daily Challenge entry point (GitHub #336) — same dark-card visual language as
 * the dashboard's "continue where you left off" card (app/dashboard/page.tsx), showing whether
 * today's attempt is still available, running, or already used.
 */
export function DailyChallengeCard({ state }: { state: DailyChallengeState | null }) {
  const status = deriveDailyChallengeCardStatus(state);
  const label = dailyChallengeCardStatusLabel(status);
  const canPlay = status.kind === 'available' || status.kind === 'in-progress';

  return (
    <div className="mb-7 flex flex-col gap-5 rounded-2xl bg-[#1b1642] p-6 text-[#F3F1FF] sm:flex-row sm:items-center">
      <div className="flex-1">
        <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[#FFD666]">Daily Challenge</div>
        <h3 className="mb-2 text-xl font-extrabold text-white">
          {status.kind === 'in-progress' ? 'Today’s question is waiting' : 'Today’s Daily Challenge'}
        </h3>
        {/* No placeholder button while loading — the same wrong-content flash the mastery title
            slot guards against (see lib/activityCardStatus.ts's header), just for a CTA instead
            of a title. */}
        <p className={`mb-4 text-sm font-semibold text-[#A79FC9] ${status.kind === 'loading' ? 'opacity-60' : ''}`}>
          {label}
        </p>
        {canPlay ? (
          <Link
            href="/daily-challenge"
            className="inline-block rounded-[10px] bg-[#7C4DFF] px-5 py-2.5 text-sm font-extrabold text-white hover:bg-[#6234d1]"
          >
            {status.kind === 'in-progress' ? 'Resume' : 'Play now'}
          </Link>
        ) : status.kind === 'unavailable' ? (
          <Link
            href="/courses"
            className="inline-block rounded-[10px] border border-[#332b6b] px-5 py-2.5 text-sm font-extrabold text-[#A79FC9] hover:border-[#8b5cf6] hover:text-white"
          >
            Browse courses
          </Link>
        ) : null}
      </div>
    </div>
  );
}
