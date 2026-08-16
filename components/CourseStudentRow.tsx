'use client';

import Link from 'next/link';
import type { CourseStudent } from '../lib/courseClient';

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    </svg>
  );
}

const VARIANT_STYLES = {
  // The original light-content-area look CourseStudentList always had.
  light: {
    card: 'border-gray-100 bg-gray-50',
    cardAttention: 'border-brand-danger/40 bg-brand-danger/5',
    name: 'text-brand-navy',
    meta: 'text-gray-500',
    remove: 'border-gray-200 bg-white text-gray-400 hover:border-brand-danger/40 hover:text-brand-danger',
  },
  // For CourseStudentsDrawer, which sits on the app's dark modal surface (bg-brand-navy) rather
  // than AppShell's light <main> — same row, different surface's tokens.
  dark: {
    card: 'border-brand-navy-border bg-brand-navy-2',
    cardAttention: 'border-brand-danger/40 bg-brand-danger/10',
    name: 'text-white',
    meta: 'text-brand-ink-muted',
    remove: 'border-brand-navy-border bg-brand-navy text-brand-ink-muted hover:border-brand-danger/40 hover:text-brand-danger',
  },
} as const;

/**
 * One enrolled student — extracted out of CourseStudentList (GitHub #378) so
 * CourseStudentsDrawer and the full course-students page can share the exact same row instead of
 * each hand-rolling their own. `variant` only ever changes color tokens, never structure/content,
 * so the two surfaces can't drift on what a row actually shows.
 */
export function CourseStudentRow({
  student,
  onRemove,
  variant = 'light',
}: {
  student: CourseStudent;
  onRemove: (student: CourseStudent) => void;
  variant?: 'light' | 'dark';
}) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div
      className={`flex items-center gap-3 rounded-brand-lg border p-4 transition ${
        student.needsAttention ? styles.cardAttention : styles.card
      }`}
    >
      <Link
        href={`/instructor/students/${encodeURIComponent(student.id)}?name=${encodeURIComponent(student.name)}`}
        className="min-w-0 flex-1 hover:underline"
      >
        <div className="flex items-center gap-2">
          <span className={`truncate font-extrabold ${styles.name}`}>{student.name}</span>
          {student.needsAttention ? (
            <span className="inline-flex flex-none items-center rounded-full bg-brand-danger/15 px-2 py-0.5 text-[11px] font-extrabold text-brand-danger">
              Needs attention
            </span>
          ) : null}
        </div>
        <p className={`mt-0.5 text-xs font-semibold ${styles.meta}`}>
          {student.attempts} attempt{student.attempts === 1 ? '' : 's'} ·{' '}
          {student.averageScore === null ? 'no score yet' : `${student.averageScore}% avg`}
        </p>
      </Link>

      <button
        type="button"
        onClick={() => onRemove(student)}
        aria-label={`Remove ${student.name} from this course`}
        className={`flex h-9 w-9 flex-none items-center justify-center rounded-full border transition ${styles.remove}`}
      >
        <TrashIcon />
      </button>
    </div>
  );
}
