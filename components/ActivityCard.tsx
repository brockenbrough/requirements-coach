'use client';

import Link from 'next/link';
import type { ActivityDefinition, Difficulty } from '../lib/activityContent';

const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const DIFFICULTY_CLASSES: Record<Difficulty, string> = {
  1: 'bg-[#4ADE80]/20 text-[#1e8f52]',
  2: 'bg-[#2DD4BF]/20 text-[#0f7d70]',
  3: 'bg-[#FFD666]/25 text-[#8a6100]',
};

function CategoryIcon({ category }: { category: string }) {
  if (category === 'Acceptance Criteria') {
    return (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="#2DD4BF" strokeWidth={2}>
        <path d="M6 3v18" />
        <path d="M6 4c4-2 5 2 9 0v8c-4 2-5-2-9 0" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="#7C4DFF" strokeWidth={2}>
      <path d="M12 6C9 4 5 4 3 5v14c2-1 6-1 9 1 3-2 7-2 9-1V5c-2-1-6-1-9 1Z" />
    </svg>
  );
}

export function ActivityCard({
  activity,
  level,
  title,
  bestScore,
  hasInProgress,
}: {
  activity: ActivityDefinition;
  level: Difficulty;
  title: string;
  bestScore: { score: number; maxScore: number } | null;
  hasInProgress: boolean;
}) {
  const badgeBg = activity.category === 'Acceptance Criteria' ? 'bg-[#2DD4BF]/15' : 'bg-[#7C4DFF]/15';

  return (
    <Link
      href={`/activities/${activity.slug}`}
      className="flex flex-col gap-3 rounded-2xl border border-[#332b6b] bg-[#1b1642] p-5 text-left text-[#F3F1FF] transition hover:-translate-y-0.5 hover:border-[#8b5cf6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2DD4BF]"
    >
      <span className={`flex h-11 w-11 items-center justify-center rounded-[10px] ${badgeBg}`}>
        <CategoryIcon category={activity.category} />
      </span>
      <h4 className="text-base font-extrabold text-white">{activity.name}</h4>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${DIFFICULTY_CLASSES[level]}`}>
          {DIFFICULTY_LABEL[level]} · Level {level}
        </span>
        <span className="text-xs font-bold text-[#A79FC9]">{title}</span>
      </div>
      <p className="text-sm font-bold text-[#A79FC9]">
        {hasInProgress
          ? 'In progress'
          : bestScore
            ? `Best score: ${bestScore.score} / ${bestScore.maxScore}`
            : 'Not started yet'}
      </p>
    </Link>
  );
}
