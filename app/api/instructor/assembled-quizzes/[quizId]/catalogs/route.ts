import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import { isActivityType } from '../../../../../../lib/activityTypes';
import { findOwnedAssembledQuiz, linkCatalogToQuiz } from '../../../../../../lib/assembledQuizQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/instructor/assembled-quizzes/{quizId}/catalogs — adds a catalog to the quiz's
 * composition (GitHub #361 requirement 1). Body: { activityType }.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor, or isn't this quiz's creator (no body either way)
 * - 404 quizId matches no quiz
 * - 400 missing activityType, or activityType matches no catalog
 * - 200 { activityType } — 200, not 201: linking an already-linked catalog is a no-op success
 *   (uq_assembled_quiz_catalog), not a second resource created
 * - 500 Supabase not configured, or the insert fails for a reason other than the unique index
 */
export async function POST(request: Request, { params }: { params: { quizId: string } }) {
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

  const found = await findOwnedAssembledQuiz(supabase, params.quizId, guard.user_id);
  if (found.status === 'error') return Response.json({ error: found.error.message }, { status: 500 });
  if (found.status === 'not_found') return Response.json({ error: 'Quiz not found.' }, { status: 404 });
  if (found.status === 'forbidden') return new Response(null, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { activityType } = (body ?? {}) as { activityType?: unknown };
  if (typeof activityType !== 'string' || activityType.trim() === '') {
    return Response.json({ error: 'activityType is required.' }, { status: 400 });
  }

  const { valid, error: activityTypeError } = await isActivityType(supabase, activityType);
  if (activityTypeError) return Response.json({ error: activityTypeError.message }, { status: 500 });
  if (!valid) return Response.json({ error: 'activityType must be a valid catalog.' }, { status: 400 });

  const { error } = await linkCatalogToQuiz(supabase, found.quiz.assembled_quiz_id, activityType);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ activityType }, { status: 200 });
}
