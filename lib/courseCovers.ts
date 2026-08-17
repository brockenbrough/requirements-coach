// GitHub #363: default cover images for the Moodle-style course card, plus (GitHub #363
// follow-up) resolving a course's actual cover — an instructor's explicit pick or upload, or
// this picker's deterministic fallback.
//
// public/course-covers/*.svg are hand-authored abstract gradient/pattern covers (no photos, no
// third-party assets) built from the same --rc-* hex values app/globals.css defines for the
// brand-* Tailwind tokens — the SVGs are static files outside Tailwind's build, so they can't
// reference the tokens directly, but the color values themselves stay in sync with them.
export const COURSE_COVERS = [
  { src: '/course-covers/cover-1.svg', alt: '' },
  { src: '/course-covers/cover-2.svg', alt: '' },
  { src: '/course-covers/cover-3.svg', alt: '' },
] as const;

/**
 * A small, fast string hash (djb2) — not for security, just for spreading course ids evenly
 * across the 3 covers.
 */
function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return hash >>> 0;
}

/**
 * Picks one of the 3 default covers for a course, deterministically from its id — never
 * Math.random(), which would flip the cover on every render/reload and read as a bug rather than
 * a feature. The same course id always maps to the same cover.
 */
export function pickCourseCover(courseId: string): (typeof COURSE_COVERS)[number] {
  return COURSE_COVERS[hashString(courseId) % COURSE_COVERS.length];
}

/**
 * The actual image src to render for a course's cover: `coverImageUrl` if the instructor set one
 * — either by explicitly picking one of the 3 defaults (its own static path lands here
 * unchanged) or by uploading a custom image (a course-covers Storage public URL lands here) —
 * else `pickCourseCover`'s deterministic fallback. The column doesn't distinguish those two
 * "explicit" cases and doesn't need to: both are just "a src to use directly".
 */
export function resolveCourseCoverSrc(course: { id: string; coverImageUrl: string | null }): string {
  return course.coverImageUrl || pickCourseCover(course.id).src;
}
