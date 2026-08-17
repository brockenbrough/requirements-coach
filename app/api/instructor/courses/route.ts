import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import { createCourseWithUniqueCode, listCoursesForInstructor } from '../../../../lib/courseQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/courses — every course the calling instructor created, with a per-course
 * enrollment count (ix_course_creator_id backs the scoping filter).
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor (no body)
 * - 200 { courses: [{ id, name, code, createdAt, semester, studentCount }] }
 * - 500 Supabase not configured, or the query fails
 */
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json(
          { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
          { status: guard.status },
        );
  }

  const { courses, error } = await listCoursesForInstructor(supabase, guard.user_id);
  if (error || !courses) {
    return Response.json({ error: error?.message ?? 'Could not load courses.' }, { status: 500 });
  }

  return Response.json(
    {
      courses: courses.map((c) => ({
        id: c.course_id,
        name: c.course_name,
        code: c.course_code,
        createdAt: c.created_at,
        semester: c.semester,
        coverImageUrl: c.cover_image_url,
        studentCount: c.student_count,
      })),
    },
    { status: 200 },
  );
}

/**
 * POST /api/instructor/courses — creates a course (REQ-DL-5) and generates its unique,
 * shareable join code server-side (never client-supplied).
 *
 * Body: { name, semester?, coverImageUrl? }. creator_id comes from guard.user_id, never the body
 * — see lib/instructorAuth.ts. semester (GitHub #363) is optional and freeform (e.g. "SoSe
 * 2026"); a blank/whitespace-only value is normalized to null rather than rejected, same "trim,
 * then null-if-empty" treatment PATCH gives it below. coverImageUrl (GitHub #363 follow-up) is
 * likewise optional — typically a URL POST /api/instructor/course-covers just returned, or one of
 * the 3 default covers' own static path — and is not otherwise validated as an actual URL: it's
 * only ever rendered as an <img src>, and only an authenticated instructor can set it.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor (no body, matching requireInstructor's convention)
 * - 400 invalid JSON, missing/blank name, or a non-string semester/coverImageUrl
 * - 201 { course: { id, name, code, createdAt, semester, coverImageUrl } }
 * - 500 Supabase not configured, a non-collision insert error, or every code attempt collided
 */
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json(
          { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
          { status: guard.status },
        );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { name, semester, coverImageUrl } = (body ?? {}) as { name?: unknown; semester?: unknown; coverImageUrl?: unknown };
  if (typeof name !== 'string' || name.trim() === '') {
    return Response.json({ error: 'name is required.' }, { status: 400 });
  }
  if (semester !== undefined && semester !== null && typeof semester !== 'string') {
    return Response.json({ error: 'semester must be a string.' }, { status: 400 });
  }
  if (coverImageUrl !== undefined && coverImageUrl !== null && typeof coverImageUrl !== 'string') {
    return Response.json({ error: 'coverImageUrl must be a string.' }, { status: 400 });
  }
  const normalizedSemester = typeof semester === 'string' ? semester.trim() || null : null;
  const normalizedCoverImageUrl = typeof coverImageUrl === 'string' ? coverImageUrl.trim() || null : null;

  const { course, error } = await createCourseWithUniqueCode(supabase, {
    name: name.trim(),
    creatorId: guard.user_id,
    semester: normalizedSemester,
    coverImageUrl: normalizedCoverImageUrl,
  });

  if (error || !course) {
    return Response.json({ error: error?.message ?? 'Could not create course.' }, { status: 500 });
  }

  return Response.json(
    {
      course: {
        id: course.course_id,
        name: course.course_name,
        code: course.course_code,
        createdAt: course.created_at,
        semester: course.semester,
        coverImageUrl: course.cover_image_url,
      },
    },
    { status: 201 },
  );
}
