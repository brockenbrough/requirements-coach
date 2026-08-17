// Shared between lib/courseClient.ts ('use client') and the instructor course routes, so the
// routes can hand these types to whatever needs them without importing anything client-side.
// Same reason sessionTypes.ts exists — imports nothing itself.

/** Fields every course response shares, regardless of how much else it discloses. */
export type CourseMeta = {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  /** The term the course is offered in (e.g. "SoSe 2026"), instructor-set and freeform. Null renders no badge. */
  semester: string | null;
  /**
   * A specific cover to use — an instructor-uploaded image URL, or one of the 3 default covers'
   * own static path if explicitly picked. Null means "no explicit choice": the card falls back
   * to a deterministic default (lib/courseCovers.ts's resolveCourseCoverSrc), not a placeholder.
   */
  coverImageUrl: string | null;
};

export type CourseSummary = CourseMeta & { studentCount: number };

export type CourseStudent = {
  id: string;
  name: string;
  attempts: number;
  averageScore: number | null;
  abandonedCount: number;
  needsAttention: boolean;
};

export type CourseDetail = CourseMeta & { students: CourseStudent[] };

/**
 * A course a browsing student can self-enroll in with a code known only to them and the
 * instructor (course_code IS NOT NULL). Deliberately not CourseMeta & {...} — CourseMeta carries
 * `code`, and this type must never be able to hold one: the code is a secret the instructor
 * hands out directly, never displayed to a browsing student and never returned by the route
 * this type backs (GET /api/courses).
 */
export type JoinableCourse = {
  id: string;
  name: string;
  createdAt: string;
  professorName: string;
  studentCount: number;
  /** Scoped to the caller's own token — never discloses which other students are enrolled. */
  alreadyMember: boolean;
};
