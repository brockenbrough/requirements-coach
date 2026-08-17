import { getSupabaseClient } from '../../../../../lib/supabase';
import { requireInstructor } from '../../../../../lib/instructorAuth';
import {
  deleteAssembledQuiz,
  findOwnedAssembledQuiz,
  getCourseName,
  getQuizComposition,
} from '../../../../../lib/assembledQuizQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/** Shared guard + ownership dance for both handlers below — same shape as app/api/instructor/courses/[id]/route.ts's authorizeCourse. */
async function authorizeQuiz(request: Request, quizId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, response: Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 }) };
  }

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    const response =
      guard.status === 403
        ? new Response(null, { status: 403 })
        : Response.json(
            { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
            { status: guard.status },
          );
    return { ok: false as const, response };
  }

  const found = await findOwnedAssembledQuiz(supabase, quizId, guard.user_id);
  if (found.status === 'error') {
    return { ok: false as const, response: Response.json({ error: found.error.message }, { status: 500 }) };
  }
  if (found.status === 'not_found') {
    return { ok: false as const, response: Response.json({ error: 'Quiz not found.' }, { status: 404 }) };
  }
  if (found.status === 'forbidden') {
    return { ok: false as const, response: new Response(null, { status: 403 }) };
  }

  return { ok: true as const, supabase, quiz: found.quiz };
}

/**
 * GET /api/instructor/assembled-quizzes/{quizId} — one quiz's full composition (GitHub #361,
 * extended by GitHub #380): meta, every linked catalog with its genuinely-active question count
 * (total minus this quiz's own exclusions), every individually hand-picked question with its
 * source catalog, and per-level coverage against the round size — now counting hand-picked
 * questions too — so the detail page can warn before a level runs short.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor, or isn't this quiz's creator (no body either way)
 * - 404 quizId matches no quiz
 * - 200 { quiz: { id, name, description, courseId, courseName }, catalogs, levelCoverage, extraQuestions, extraUserStories, activeCatalogQuestionIds, activeCatalogUserStoryIds }
 * - 500 Supabase not configured, or any of the composition queries fail
 */
export async function GET(request: Request, { params }: { params: { quizId: string } }) {
  const auth = await authorizeQuiz(request, params.quizId);
  if (!auth.ok) return auth.response;

  const { supabase, quiz } = auth;

  const { courseName, error: courseError } = await getCourseName(supabase, quiz.course_id);
  if (courseError) return Response.json({ error: courseError.message }, { status: 500 });

  const {
    catalogs,
    levelCoverage,
    extraQuestions,
    extraUserStories,
    activeCatalogQuestionIds,
    activeCatalogUserStoryIds,
    error: compositionError,
  } = await getQuizComposition(supabase, quiz.assembled_quiz_id);
  if (
    compositionError ||
    !catalogs ||
    !levelCoverage ||
    !extraQuestions ||
    !extraUserStories ||
    !activeCatalogQuestionIds ||
    !activeCatalogUserStoryIds
  ) {
    return Response.json({ error: compositionError?.message ?? 'Could not load quiz composition.' }, { status: 500 });
  }

  return Response.json(
    {
      quiz: {
        id: quiz.assembled_quiz_id,
        name: quiz.quiz_name,
        description: quiz.description,
        courseId: quiz.course_id,
        courseName: courseName ?? 'Unknown course',
      },
      catalogs,
      levelCoverage,
      extraQuestions,
      extraUserStories,
      activeCatalogQuestionIds,
      activeCatalogUserStoryIds,
    },
    { status: 200 },
  );
}

/**
 * DELETE /api/instructor/assembled-quizzes/{quizId} — deletes the quiz (GitHub #361 requirement
 * 5). assembled_quiz_catalog and quiz_excluded_question rows cascade with it (both FK
 * ON DELETE CASCADE); the catalogs, their questions, and every catalog-level question count are
 * untouched.
 *
 * No student session ever references an assembled_quiz — GitHub #360 deliberately stopped short
 * of a session/play route for one (session_log.activity_type only ever points at a catalog, and
 * there is no assembled_quiz_id column anywhere in session_log), so there is no history to lose
 * and nothing to soft-delete: a plain hard delete is complete and correct as of today. If a
 * future issue wires up real student attempts against an assembled quiz, that issue is what needs
 * to revisit this — not this one.
 *
 * Returns 200 with { quizId }.
 */
export async function DELETE(request: Request, { params }: { params: { quizId: string } }) {
  const auth = await authorizeQuiz(request, params.quizId);
  if (!auth.ok) return auth.response;

  const { supabase, quiz } = auth;

  const { error } = await deleteAssembledQuiz(supabase, quiz.assembled_quiz_id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ quizId: quiz.assembled_quiz_id }, { status: 200 });
}
