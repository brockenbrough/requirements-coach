'use client';

import { useState } from 'react';
import { CopyCodeButton } from './CopyCodeButton';
import { duplicateCourse, type CourseSummary } from '../lib/courseClient';
import { useModalDismiss } from './useModalDismiss';

/**
 * The popup that duplicates a course (GitHub #362) — same two-phase form-then-reveal-the-new-code
 * shape as CreateCourseModal.tsx, reused rather than re-invented: the whole reason this form
 * exists is to hand the instructor a fresh code they still need to read and copy, so success swaps
 * the panel to a "Course Duplicated" view that stays open until dismissed deliberately, instead of
 * auto-closing or toasting mid-read.
 *
 * Only the name is asked for — quizzes and other settings are copied automatically server-side
 * (POST /api/instructor/courses/{id}/duplicate). There is no separate "enrollment key" field:
 * course only has course_code, which is always freshly server-generated on both create and
 * duplicate (see the route's own comment for why), so there is nothing to prefill from the
 * original or let the instructor set. The hint text below states plainly what *is* and isn't
 * copied, since "students carry over too" is the one wrong assumption this form has to head off.
 *
 * `onCreated` fires the moment the API call succeeds, matching CreateCourseModal's own timing
 * rationale: a caller showing a list should update immediately, independent of whether the
 * instructor is still looking at the revealed code.
 */
export function DuplicateCourseModal({
  course,
  token,
  onClose,
  onCreated,
}: {
  course: { id: string; name: string };
  token: string;
  onClose: () => void;
  onCreated: (course: CourseSummary) => void;
}) {
  const [name, setName] = useState(`${course.name} (Copy)`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [duplicatedCourse, setDuplicatedCourse] = useState<CourseSummary | null>(null);

  const { panelRef, firstFieldRef, requestClose } = useModalDismiss<HTMLDivElement, HTMLInputElement>({
    onClose,
    isBlocked: submitting,
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    setError('');

    const result = await duplicateCourse(token, course.id, { name: name.trim() });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onCreated(result.data.course);
    setDuplicatedCourse(result.data.course);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicate-course-title"
        className="w-full max-w-md rounded-brand-lg border border-brand-navy-border bg-brand-navy p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand-gold">Courses</p>
            <h2 id="duplicate-course-title" className="mt-1 text-xl font-extrabold text-white">
              {duplicatedCourse ? 'Course Duplicated' : 'Duplicate Course'}
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={submitting}
            aria-label="Close"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-brand-navy-border bg-brand-navy-2 text-brand-ink-muted transition hover:text-white disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {duplicatedCourse ? (
          <>
            <div className="rounded-brand-lg border border-brand-navy-border bg-brand-navy-2 p-6 text-center">
              <p className="text-xs font-extrabold uppercase tracking-wide text-brand-teal">{duplicatedCourse.name}</p>
              <p className="mt-2 text-4xl font-extrabold tracking-[0.2em] text-white">{duplicatedCourse.code}</p>
              <p className="mt-1.5 text-xs font-semibold text-brand-ink-muted">
                Share this code with your students so they can join.
              </p>
              <div className="mt-4 flex justify-center">
                <CopyCodeButton code={duplicatedCourse.code} />
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={requestClose}
                className="rounded-brand-md bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
              Copy name
              <input
                ref={firstFieldRef}
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1.5 block w-full rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple"
              />
            </label>

            <p className="mt-3 text-xs font-semibold text-brand-ink-muted">
              Quizzes and settings are copied. The new course starts with no enrolled students —
              share the new course code so students can join.
            </p>

            {error ? <p className="mt-3 text-xs font-bold text-brand-danger">{error}</p> : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={requestClose}
                disabled={submitting}
                className="rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-4 py-2 text-sm font-extrabold text-brand-ink-muted transition hover:text-white disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || submitting}
                className="rounded-brand-md bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? 'Duplicating…' : 'Duplicate'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
