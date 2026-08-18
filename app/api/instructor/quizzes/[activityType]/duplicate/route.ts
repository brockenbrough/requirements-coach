import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import { deriveActivityTypeKey } from '../../../../../../lib/activityTypes';
import { duplicateCatalog, getQuizByActivityType } from '../../../../../../lib/activityTypeQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/instructor/quizzes/:activityType/duplicate — copies a catalog the caller can view
 * (GitHub #478) into a brand-new catalog they own. The main use is an example catalog's
 * "Duplicate" action (creator_id IS NULL), but the same visibility rule GET on the sibling route
 * uses also lets an instructor duplicate one of their own catalogs — the source is only ever read,
 * see duplicateCatalog (lib/activityTypeQueries.ts) for the copy mechanics and its own
 * rollback-by-hand discipline.
 *
 * Body: { name: string } — the copy's display name; the stored key is derived from it the same way
 * POST /api/activities/types derives one at creation (deriveActivityTypeKey).
 *
 * Same visibility rule as GET on the sibling route: a catalog that's neither built-in nor the
 * caller's own 403s here too, so this route can't be used to read a colleague's catalog contents
 * out by guessing its activityType and duplicating it.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor, or the source catalog belongs to a different instructor (no
 *   body either way)
 * - 404 source activityType matches no catalog
 * - 400 invalid JSON, missing/blank name, or a name whose derived key is empty/too long
 * - 409 the derived key collides with an existing catalog — pick a different name
 * - 201 { quiz: { activityType, name, description, gradingKind, ratingPrompt, questionCount } }
 * - 500 Supabase not configured, or a query fails
 */
export async function POST(request: Request, { params }: { params: { activityType: string } }) {
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

  const { activityType } = params;

  const { quiz: source, creatorId, error: sourceError } = await getQuizByActivityType(supabase, activityType);
  if (sourceError) return Response.json({ error: sourceError.message }, { status: 500 });
  if (!source) return Response.json({ error: 'Catalog not found.' }, { status: 404 });
  if (creatorId !== null && creatorId !== guard.user_id) return new Response(null, { status: 403 });

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

  const keyResult = deriveActivityTypeKey(name);
  if (!keyResult.ok) return keyResult.response;

  const result = await duplicateCatalog(supabase, {
    sourceActivityType: activityType,
    newKey: keyResult.key,
    newName: name.trim(),
    creatorId: guard.user_id,
  });

  if (result.status === 'not_found') return Response.json({ error: 'Catalog not found.' }, { status: 404 });
  if (result.status === 'name_conflict') {
    return Response.json({ error: 'A quiz with this name already exists. Choose a different name.' }, { status: 409 });
  }
  if (result.status === 'error') return Response.json({ error: result.error.message }, { status: 500 });

  return Response.json({ quiz: result.quiz }, { status: 201 });
}
