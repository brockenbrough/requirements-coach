import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import { findOwnedCourse } from '../../../../../../lib/courseQueries';
import { listAssembledQuizzesForCourse } from '../../../../../../lib/assembledQuizQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/courses/{id}/quizzes — every assembled_quiz belonging to this course
 * (GitHub #360), backing the course detail page's own "Quizzes" section (GitHub #362 follow-up).
 *
 * Route param is `[id]`, not `[courseId]`: the sibling routes already nested under
 * app/api/instructor/courses/[id]/... (export, students, duplicate) all use that name, and
 * Next.js rejects two differently-named dynamic segments at the same position in the route tree
 * (see the duplicate route's own docblock for the same constraint).
 *
 * Ownership check is the same findOwnedCourse 404-then-403 dance every other
 * /api/instructor/courses/{id}/... route uses — a course's quizzes are only visible to the
 * instructor who owns the course.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor, or doesn't own the course (no body either way)
 * - 404 course doesn't exist
 * - 200 { quizzes: AssembledQuizSummary[] }
 * - 500 Supabase not configured, or a query failure
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
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

  const { quizzes, error } = await listAssembledQuizzesForCourse(supabase, params.id);
  if (error || !quizzes) {
    return Response.json({ error: error?.message ?? 'Could not load quizzes.' }, { status: 500 });
  }

  return Response.json({ quizzes }, { status: 200 });
}
