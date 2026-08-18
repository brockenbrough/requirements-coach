import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import { createCourseWithUniqueCode, deleteCourse, findOwnedCourse } from '../../../../../../lib/courseQueries';
import { duplicateQuizzesForCourse } from '../../../../../../lib/assembledQuizQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/instructor/courses/{id}/duplicate — copies a course's setup (GitHub #362), not its
 * history: a new course row (caller-given name, a freshly generated course_code from the same
 * createCourseWithUniqueCode generator/retry loop POST /api/instructor/courses uses — never the
 * source's own code), plus every assembled_quiz belonging to the source course, each with its
 * assembled_quiz_catalog links and quiz_excluded_question exclusions re-pointed at the copy
 * (duplicateQuizzesForCourse, lib/assembledQuizQueries.ts) — no catalog or question is ever
 * touched, only referenced.
 *
 * student_course (enrollment) is never queried or written by this route or by
 * duplicateQuizzesForCourse — the new course therefore always starts at exactly 0 enrolled
 * students, even though the source course may have many. The same is true of session_log/answer
 * history: neither table has a course_id at all (see CLAUDE.md's Courses section), so there is
 * nothing reachable from a course that this route could carry over even if it tried.
 *
 * Body: { name } — required, the copy's display name. There is no `enrollmentKey` field: course
 * only stores course_code (see createCourse's own comment in lib/courseClient.ts), which is
 * always freshly server-generated and never client-settable on create *or* on duplicate — so a
 * request body enrollmentKey has no column to land in and is silently ignored, not persisted.
 * There is likewise no `semester` field: createCourseWithUniqueCode is called without one (see
 * its own docblock), so the copy always starts with semester: null — a duplicate is typically
 * meant for a new offering, and carrying the source's term over would misrepresent it. The cover
 * image is the opposite case: the source's cover_image_url *is* carried over (a course's visual
 * identity is more "same course, different section" than its semester is), so there's no
 * corresponding `coverImageUrl` body field either — there would be nothing for it to override.
 *
 * Not transactional (the Supabase JS client has none): if copying the quizzes fails after the new
 * course row exists, the route deletes that row, and its cascading FKs (fk_assembled_quiz_course,
 * fk_assembled_quiz_catalog_quiz, fk_quiz_excluded_question_quiz, all ON DELETE CASCADE) take any
 * partially-inserted quizzes/links/exclusions with it — so a failure can never leave a
 * half-duplicated course visible.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor, or doesn't own the source course (no body either way)
 * - 404 source course doesn't exist
 * - 400 invalid JSON, or missing/blank name
 * - 201 { course: { id, name, code, createdAt, semester: null, coverImageUrl, studentCount: 0 } }
 * - 500 Supabase not configured, course creation failure, or quiz-copy failure (new course rolled back)
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
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

  const found = await findOwnedCourse(supabase, params.id, guard.user_id);
  if (found.status === 'error') return Response.json({ error: found.error.message }, { status: 500 });
  if (found.status === 'not_found') return Response.json({ error: 'Course not found.' }, { status: 404 });
  if (found.status === 'forbidden') return new Response(null, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { name } = (body ?? {}) as { name?: unknown };
  if (typeof name !== 'string' || name.trim() === '') {
    return Response.json({ error: 'name is required.' }, { status: 400 });
  }

  const { course, error: createError } = await createCourseWithUniqueCode(supabase, {
    name: name.trim(),
    creatorId: guard.user_id,
    coverImageUrl: found.course.cover_image_url,
  });

  if (createError || !course) {
    return Response.json({ error: createError?.message ?? 'Could not create course.' }, { status: 500 });
  }

  const { error: quizzesError } = await duplicateQuizzesForCourse(supabase, {
    sourceCourseId: params.id,
    targetCourseId: course.course_id,
    creatorId: guard.user_id,
  });

  if (quizzesError) {
    await deleteCourse(supabase, course.course_id);
    return Response.json({ error: quizzesError.message ?? "Could not copy the course's quizzes." }, { status: 500 });
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
        studentCount: 0,
      },
    },
    { status: 201 },
  );
}
