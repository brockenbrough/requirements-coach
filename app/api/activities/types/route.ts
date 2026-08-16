import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import { isGradingKind, slugifyQuizName } from '../../../../lib/activityTypes';
import { findOwnedCourse } from '../../../../lib/courseQueries';
import { linkActivityTypeToCourse } from '../../../../lib/activityCourseQueries';

// Matches activity_type.activity_type varchar(50) in supabase/schema.sql.
const MAX_KEY_LENGTH = 50;

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/activities/types — creates a named quiz (GitHub #347), i.e. a new row in the
 * activity_type lookup table every question/session_log/title_definition already keys on, now
 * linked to exactly one course (activity_type_course) an instructor must own — see that table's
 * own header comment in supabase/schema.sql. A course-less activity is not a valid end state any
 * more: no student can ever see or start a session against one (lib/activityCourseQueries.ts's
 * checkActivityAccess), so requiring courseId here is what actually enforces that at the source.
 *
 * Body: { name: string, courseId: string, gradingKind: 'mcq' | 'llm-graded', description?: string }.
 *
 * GitHub #379: gradingKind decides which pool the new activity draws from — question/answer rows
 * for 'mcq', free-text user_story prompts graded by the instructor's configured LLM provider for
 * 'llm-graded'. It is required with no default even though the column has one: enforcing the
 * choice only in the create modal would let the route quietly fall back to 'mcq' for any other
 * caller, and the kind is not editable afterwards, so a silent default is a wrong catalog rather
 * than a fixable one.
 *
 * The stored key (activity_type)
 * is *derived* from name via slugifyQuizName — upper-cased, non-alphanumeric runs collapsed to
 * one underscore, the same format the three built-in keys already have — never client-supplied
 * directly, so an instructor names their quiz the same way they'd name anything else in the app.
 *
 * courseId ownership is checked the same 404-then-403 way every other instructor-facing course
 * route does (findOwnedCourse, lib/courseQueries.ts) — an instructor can only give their own
 * activity to one of their own courses, never someone else's.
 *
 * The key must be unique. A collision is reported as 409, not silently resolved with a suffix —
 * the instructor picks a different name themselves, same as a duplicate username or course code
 * anywhere else in the app.
 *
 * creator_id comes from the authenticated instructor (guard.user_id), never the request body.
 *
 * The activity_type insert and the activity_type_course link insert are not one transaction (the
 * Supabase JS client offers none — same limitation createAssembledQuiz documents) — a link
 * failure deletes the activity_type row it was about to belong to, the same hand-rolled-rollback
 * shape that function uses, so a partial write never leaves an unlinked, invisible-forever quiz.
 *
 * Returns: { quiz: { activityType, name, description, gradingKind, courseId, courseName } }
 */
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json({ error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' }, { status: guard.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { name, description, courseId, gradingKind } = (body ?? {}) as {
    name?: unknown;
    description?: unknown;
    courseId?: unknown;
    gradingKind?: unknown;
  };

  if (typeof name !== 'string' || name.trim() === '') {
    return Response.json({ error: 'name is required.' }, { status: 400 });
  }

  if (typeof courseId !== 'string' || courseId.trim() === '') {
    return Response.json({ error: 'courseId is required.' }, { status: 400 });
  }

  if (!isGradingKind(gradingKind)) {
    return Response.json({ error: 'gradingKind must be "mcq" or "llm-graded".' }, { status: 400 });
  }

  if (description !== undefined && description !== null && typeof description !== 'string') {
    return Response.json({ error: 'description must be a string.' }, { status: 400 });
  }

  const key = slugifyQuizName(name);

  if (key === '') {
    return Response.json({ error: 'name must contain at least one letter or number.' }, { status: 400 });
  }
  if (key.length > MAX_KEY_LENGTH) {
    return Response.json(
      { error: `name is too long — the derived key must be ${MAX_KEY_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }

  // Ownership is checked before the activity_type insert, not after — a bad courseId must not
  // create a quiz that then fails to link, mirroring POST /api/instructor/assembled-quizzes'
  // ordering ("an instructor probing someone else's course id learns nothing else").
  const ownedCourse = await findOwnedCourse(supabase, courseId, guard.user_id);
  if (ownedCourse.status === 'not_found') return Response.json({ error: 'Course not found.' }, { status: 404 });
  if (ownedCourse.status === 'forbidden') return new Response(null, { status: 403 });
  if (ownedCourse.status === 'error') return Response.json({ error: ownedCourse.error.message }, { status: 500 });

  const trimmedDescription = typeof description === 'string' && description.trim() !== '' ? description.trim() : null;

  const { data, error } = await supabase
    .from('activity_type')
    .insert({
      activity_type: key,
      quiz_name: name.trim(),
      description: trimmedDescription,
      grading_kind: gradingKind,
      creator_id: guard.user_id,
    })
    .select('activity_type, quiz_name, description, grading_kind')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: 'A quiz with this name already exists. Choose a different name.' }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  const row = data as { activity_type: string; quiz_name: string; description: string | null; grading_kind: string };

  const { error: linkError } = await linkActivityTypeToCourse(supabase, { activityType: row.activity_type, courseId: ownedCourse.course.course_id });
  if (linkError) {
    await supabase.from('activity_type').delete().eq('activity_type', row.activity_type);
    return Response.json({ error: linkError.message }, { status: 500 });
  }

  return Response.json(
    {
      quiz: {
        activityType: row.activity_type,
        name: row.quiz_name,
        description: row.description,
        gradingKind: row.grading_kind,
        courseId: ownedCourse.course.course_id,
        courseName: ownedCourse.course.course_name,
      },
    },
    { status: 201 },
  );
}
