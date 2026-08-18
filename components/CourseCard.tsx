import Link from 'next/link';
import type { CourseSummary, CourseClassStats as CourseClassStatsData, CourseActivityStats } from '../lib/courseClient';
import { resolveCourseCoverSrc } from '../lib/courseCovers';
import { CourseCardMenu } from './CourseCardMenu';
import { QuizProgressBar } from './QuizProgressBar';

/**
 * One course, styled after a Moodle course card (GitHub #363): a cover image on top, a kebab
 * menu of the existing course actions in its corner, and a text area below with the course name,
 * an optional semester badge, and an optional quiz-progress bar. Used everywhere a course is
 * shown as a card — app/instructor/courses/page.tsx and the "My Courses" section of
 * app/instructor/page.tsx — so the look only has to be maintained in one place.
 *
 * The cover is resolveCourseCoverSrc's result (lib/courseCovers.ts): an instructor's explicit
 * pick or upload if they set one, else one of the 3 static defaults, picked deterministically
 * from the course id.
 *
 * classStats mirrors the old card's convention: `undefined` renders no progress section at all
 * (the caller isn't fetching stats), `null` renders a loading placeholder (never a misleading
 * "0%" flash), and a real object renders the bar — but only when the course actually has quizzes
 * and there's someone enrolled to have progress; see the progressPercent comment below for why
 * "passed" is the metric.
 *
 * The info area is always a Link straight to the course detail page, like Moodle's own card — the
 * whole card body navigates, on every page that renders it. A separate small expand button (top
 * right, beside the kebab menu) is what toggles this course's per-quiz Class Average / Pass Rate /
 * Attempted stats inline, inside the card itself (GitHub #423; these used to render in a separate
 * InstructorActivityStats block below the whole card grid, one course's worth of numbers headed
 * only by quiz name with no visual tie back to its card — moving them into the card they describe
 * is the entire fix). The button is independent of navigation by design: clicking it must never
 * follow the card's Link, so it stopPropagation()s/preventDefault()s the same way
 * CourseCardMenu's own trigger does.
 */
export function CourseCard({
  course,
  classStats,
  activityStats,
  onDuplicate,
  onEdit,
  onDelete,
  statsExpanded,
  onToggleStats,
}: {
  course: CourseSummary;
  classStats?: CourseClassStatsData | null;
  /**
   * Per-quiz Class Average / Pass Rate / Attempted for this course, GitHub #423. `undefined`
   * renders nothing (matches classStats' convention above) — the caller passes this only for the
   * currently-expanded card, since the data is fetched on demand per course, not batched for the
   * whole grid the way classStats is. `null` is "fetch in flight," `[]` is "no quizzes assigned."
   */
  activityStats?: CourseActivityStats[] | null;
  onDuplicate?: (course: CourseSummary) => void;
  onEdit?: (course: CourseSummary) => void;
  onDelete?: (course: CourseSummary) => void;
  statsExpanded?: boolean;
  /** Renders the expand button only when passed — a page that never fetches stats gets no button. */
  onToggleStats?: (course: CourseSummary) => void;
}) {
  const coverSrc = resolveCourseCoverSrc(course);

  // "Passed" (not "started") is the progress metric: a session that's merely started hasn't
  // actually made progress in the quiz, the same "more complete information" reasoning
  // lib/activityCardStatus.ts uses to rank 'mastered' above 'best-score'. Null percent (no
  // students enrolled to measure, or the query hasn't loaded) omits the bar rather than showing
  // a misleading 0%.
  const progressPercent = classStats && classStats.hasQuizzes ? classStats.passedPercent : null;

  const info = (
    <>
      {/*
        Plain <img>, not next/image: a cover can be one of the 3 static local SVG defaults (and
        Next's image optimizer refuses to process SVGs at all unless next.config.js opts in with
        images.dangerouslyAllowSVG, plus its own recommended CSP — real overhead for a format
        that gains nothing from raster resizing/format conversion) or an instructor-uploaded image
        on the Supabase Storage domain (an arbitrary remote host next/image would need configuring
        for too). Matches components/Avatar.tsx, the only other place this project renders a
        dynamic image.
      */}
      <div className="relative h-28 w-full overflow-hidden bg-brand-navy sm:h-32">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverSrc} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      </div>
      <div className="p-4">
        <p className="line-clamp-1 font-extrabold text-brand-navy">{course.name}</p>

        {course.semester ? (
          <span className="mt-1.5 inline-flex items-center rounded-full bg-brand-purple/10 px-2.5 py-0.5 text-xs font-bold text-brand-purple">
            {course.semester}
          </span>
        ) : null}

        {classStats === null ? (
          <div className="mt-3" aria-hidden="true">
            <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
            <div className="mt-1.5 h-1.5 w-full animate-pulse rounded-full bg-gray-100" />
          </div>
        ) : progressPercent !== null ? (
          <QuizProgressBar percent={progressPercent} />
        ) : null}

        <p className="mt-2.5 text-xs font-semibold text-gray-500">
          {course.studentCount} student{course.studentCount === 1 ? '' : 's'}
        </p>

        {activityStats !== undefined ? (
          <div className="mt-3 border-t border-gray-100 pt-3">
            {activityStats === null ? (
              <div className="h-12 animate-pulse rounded-brand-lg bg-gray-100" aria-hidden="true" />
            ) : activityStats.length === 0 ? (
              <p className="text-xs font-semibold text-gray-400">No quizzes assigned to this course yet.</p>
            ) : (
              <div className="space-y-2">
                {activityStats.map((stat) => (
                  <div key={stat.quizId} className="rounded-brand-lg border border-gray-100 bg-gray-50 p-3">
                    <p className="line-clamp-1 text-xs font-extrabold text-brand-navy">{stat.quizName}</p>
                    <div className="mt-1.5 flex gap-4">
                      <div>
                        <div className="text-sm font-extrabold tabular-nums text-brand-navy">
                          {stat.classAverage > 0 ? `${stat.classAverage}%` : '—'}
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Class avg</div>
                      </div>
                      <div>
                        <div className="text-sm font-extrabold tabular-nums text-brand-teal-dark">
                          {stat.passRate > 0 ? `${stat.passRate}%` : '—'}
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Pass rate</div>
                      </div>
                      <div>
                        <div className="text-sm font-extrabold tabular-nums text-brand-navy">
                          {stat.completionCount} / {stat.enrolledCount}
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Attempted</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </>
  );

  return (
    <div
      className={`group relative overflow-hidden rounded-brand-lg border bg-white shadow-sm transition hover:shadow-md ${
        statsExpanded ? 'border-brand-purple' : 'border-gray-100 hover:border-brand-purple/40'
      }`}
    >
      <Link href={`/instructor/courses/${encodeURIComponent(course.id)}`} className="block text-left">
        {info}
      </Link>

      <div className="absolute right-3 top-3 flex items-center gap-2">
        {onToggleStats ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleStats(course);
            }}
            aria-expanded={statsExpanded ?? false}
            aria-label={statsExpanded ? 'Hide course statistics' : 'Show course statistics'}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55"
          >
            <ChevronIcon expanded={statsExpanded ?? false} />
          </button>
        ) : null}
        <CourseCardMenu course={course} onDuplicate={onDuplicate} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
