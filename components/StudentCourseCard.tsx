'use client';

import { useState } from 'react';
import { joinCourseByCode, leaveCourse } from '../lib/studentCourseClient';
import { resolveCourseCoverSrc } from '../lib/courseCovers';
import type { JoinableCourse } from '../lib/courseTypes';

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// Same door-and-arrow shape as AppShell.tsx's own (unexported) LogoutIcon — "leaving" reads the
// same way whether it's the app or a single course.
function LeaveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

/**
 * GitHub #242 (UI-2), restyled to match components/CourseCard.tsx (GitHub #424): one course on
 * the student-facing browse/join page, in the same Moodle-style cover-image/name/semester-badge
 * layout the instructor's own course cards use — cover via lib/courseCovers.ts's
 * resolveCourseCoverSrc (an instructor's pick/upload, or the same deterministic default), and the
 * same optional semester pill. Still a distinct component rather than a shared one: this card's
 * action is "join"/"leave", not a kebab menu of instructor actions, and its data (JoinableCourse)
 * has no ownership/roster fields to expose a menu for.
 *
 * The join code is a secret the instructor hands out directly — this card never sees or
 * displays it (JoinableCourse has no code field at all), only submits whatever the student
 * types. POST /api/courses/join resolves the course purely from that code, server-side, so a
 * successful join's onJoined(courseId) uses the id the *server* confirms, not necessarily this
 * row's — a typo'd-but-still-valid code for a different course would otherwise silently mark
 * the wrong card as joined.
 *
 * Leave action (GitHub #324): a round icon button pinned over the top-right corner of the cover
 * image, the same corner/size CourseCardMenu's kebab trigger uses, rather than a text link
 * competing with "Joined"/"Join" for the card's one primary-action slot. Still gated behind the
 * same window.confirm() as components/ResumeOrAbandonPrompt.tsx for a single-course, self-only
 * consequence. On success this card flips back to the not-joined state (onLeft) rather than
 * disappearing, since this page lists every course, member or not.
 */
export function StudentCourseCard({
  course,
  token,
  onJoined,
  onLeft,
}: {
  course: JoinableCourse;
  token: string;
  onJoined: (courseId: string) => void;
  onLeft: (courseId: string) => void;
}) {
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  const [codeInputOpen, setCodeInputOpen] = useState(false);
  const [enteredCode, setEnteredCode] = useState('');

  async function handleJoin(code: string) {
    if (joining) return;

    setJoining(true);
    setError('');

    const result = await joinCourseByCode(token, code);
    setJoining(false);

    if (!result.ok) {
      setError(result.error);
      return; // input stays open so the student can immediately retry
    }

    setCodeInputOpen(false);
    setEnteredCode('');
    onJoined(result.data.course.id);
  }

  async function handleLeave() {
    if (leaving) return;
    if (!confirm(`Leave ${course.name}? You can rejoin later with the course code.`)) return;

    setLeaving(true);
    setError('');

    const result = await leaveCourse(token, course.id);
    setLeaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onLeft(course.id);
  }

  return (
    <div className="relative overflow-hidden rounded-brand-lg border border-gray-100 bg-white shadow-sm transition hover:border-brand-purple/40 hover:shadow-md">
      {/* Plain <img>, not next/image — see components/CourseCard.tsx's own comment on why. */}
      <div className="relative h-28 w-full overflow-hidden bg-brand-navy sm:h-32">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={resolveCourseCoverSrc(course)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      </div>

      {course.alreadyMember ? (
        <button
          type="button"
          onClick={() => void handleLeave()}
          disabled={leaving}
          aria-label={`Leave ${course.name}`}
          title="Leave course"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <LeaveIcon />
        </button>
      ) : null}

      <div className="p-4">
        <p className="line-clamp-1 font-extrabold text-brand-navy">{course.name}</p>

        {course.semester ? (
          <span className="mt-1.5 inline-flex items-center rounded-full bg-brand-purple/10 px-2.5 py-0.5 text-xs font-bold text-brand-purple">
            {course.semester}
          </span>
        ) : null}

        <p className="mt-2.5 text-xs font-semibold text-gray-500">
          {course.professorName} · {course.studentCount} student{course.studentCount === 1 ? '' : 's'}
        </p>

        {error ? <p className="mt-2 text-xs font-semibold text-brand-danger">{error}</p> : null}

        <div className="mt-3.5">
          {course.alreadyMember ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-teal/20 px-4 py-2 text-sm font-extrabold text-brand-teal-dark">
              <CheckIcon />
              Joined
            </span>
          ) : codeInputOpen ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleJoin(enteredCode);
              }}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <input
                type="text"
                value={enteredCode}
                onChange={(event) => setEnteredCode(event.target.value)}
                placeholder="Course code"
                autoFocus
                className="rounded-brand-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none transition focus:border-brand-purple"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!enteredCode.trim() || joining}
                  className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {joining ? 'Joining…' : 'Join'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCodeInputOpen(false);
                    setEnteredCode('');
                    setError('');
                  }}
                  className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 transition hover:border-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCodeInputOpen(true)}
              className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
            >
              Join
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
