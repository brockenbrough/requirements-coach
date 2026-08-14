'use client';

import Link from 'next/link';
import { activityCardStatusLabel, type ActivityCardStatus } from '../lib/activityCardStatus';
import type { ActivitySlug, Difficulty } from '../lib/activityContent';

const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
// Same green-to-orange difficulty color schema as the activity detail page
// (app/activities/[slug]/page.tsx's DIFFICULTY_COLOR) — kept in sync there rather than shared.
// That page's badge uses solid text on a neutral bg-white/10 pill for all three levels; this
// card's chips are tinted-background pills instead (its own established style, predating the
// color schema unification), so the two intentionally differ in treatment while sharing hue.
//
// The tinted pill background stays a literal hex value (not the bg-brand-* token) deliberately:
// brand-* colors are `var(--rc-*)` references (tailwind.config.js), and Tailwind can only apply
// an opacity modifier like /20 to a color it can resolve at build time — bg-brand-green/20
// silently compiles to no rule at all, so the pill would have no background whatsoever. The hex
// values match --rc-green/--rc-gold-dark/--rc-danger in app/globals.css; the text half has no
// such restriction, so it stays on the brand-* tokens.
//
// Level 2 uses the *other* yellow for its text: brand-gold (#FFD666, the bright one) rather than
// brand-gold-dark (#8A6100, muddy/brownish) — swapped with the background from the earlier
// version of this pill so the visible label reads as a clear yellow instead of dark gold-brown.
const DIFFICULTY_CLASSES: Record<Difficulty, string> = {
  1: 'bg-[#4ADE80]/20 text-brand-green-dark',
  2: 'bg-[#8A6100]/25 text-brand-gold',
  3: 'bg-[#FF6B57]/20 text-brand-danger',
};

/**
 * Everything ActivityCard actually reads off an activity — deliberately narrower than the full
 * ActivityDefinition (which also carries questionBank/activityType/titles/instructions, none of
 * which this component touches). Any ActivityDefinition already satisfies this structurally, so
 * the two Type A activities pass through unchanged; the Type B "Write Acceptance Criteria" card
 * (app/activities/page.tsx) builds one of these directly instead of needing a fake
 * ActivityDefinition with an empty question bank and a made-up activity_type.
 */
export type ActivityCardData = {
  slug: ActivitySlug;
  name: string;
  category: string;
};

export function CategoryIcon({ category }: { category: string }) {
  if (category === 'Acceptance Criteria') {
    return (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="#2DD4BF" strokeWidth={2}>
        <path d="M6 3v18" />
        <path d="M6 4c4-2 5 2 9 0v8c-4 2-5-2-9 0" />
      </svg>
    );
  }
  if (category === 'Write Acceptance Criteria') {
    return (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="#2DD4BF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
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
  status,
}: {
  activity: ActivityCardData;
  level: Difficulty;
  /**
   * The student's earned mastery title for this activity, or null when they have not passed a
   * level yet. Null renders nothing at all — see lib/activityCardStatus.ts's header for why this
   * slot must never hold a placeholder (GitHub #272).
   */
  title: string | null;
  status: ActivityCardStatus;
}) {
  const badgeBg = activity.category === 'Acceptance Criteria' || activity.category === 'Write Acceptance Criteria' ? 'bg-[#2DD4BF]/15' : 'bg-[#7C4DFF]/15';

  return (
    <Link
      // The level query param lets the activity detail page (app/activities/[slug]/page.tsx)
      // render this exact level on its first paint instead of a hardcoded easy-level default
      // that then jumps once its own data finishes loading — see that page's initialLevel.
      href={`/activities/${activity.slug}?level=${level}`}
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
        {title && <span className="text-xs font-bold text-[#A79FC9]">{title}</span>}
      </div>
      <p className="text-sm font-bold text-[#A79FC9]">{activityCardStatusLabel(status)}</p>
    </Link>
  );
}
