import { getSupabaseClient } from '../../../../../lib/supabase';
import { requireInstructor } from '../../../../../lib/instructorAuth';
import { listAllQuestionsForPicker } from '../../../../../lib/assembledQuizQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/assembled-quizzes/questions — every MCQ question in the system, any
 * author, any catalog (GitHub #380). Backs the "Add individual questions" picker
 * (AddQuizQuestionsModal), which searches/filters this list client-side the same way
 * GET /api/instructor/quizzes' browse table already does for catalogs.
 *
 * Deliberately not nested under {quizId} even though its only caller today is quiz composition:
 * the list itself isn't quiz-scoped (which questions are already in a given quiz is computed by
 * the client from that quiz's own already-loaded composition), and a static `questions` segment
 * next to the dynamic `[quizId]` one is a supported Next.js route shape — the same reasoning
 * app/instructor/assembled-quizzes/[quizId]/catalogs/[activityType]/page.tsx's nesting already
 * relies on elsewhere in this feature.
 *
 * Requires only requireInstructor, no per-quiz ownership check — same reasoning
 * GET /api/instructor/quizzes has none: catalogs (and therefore their questions) are globally
 * shared and browsable by any instructor, not scoped to one quiz's creator.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor (no body)
 * - 200 { questions: PickableQuestion[] }
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

  const { questions, error } = await listAllQuestionsForPicker(supabase);
  if (error || !questions) {
    return Response.json({ error: error?.message ?? 'Could not load questions.' }, { status: 500 });
  }

  return Response.json({ questions }, { status: 200 });
}
