import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import { getQuizByActivityType } from '../../../../../../lib/activityTypeQueries';
import { loadTitleLadder, saveTitleLadder } from '../../../../../../lib/titleAuthoringQueries';
import { validateTitleLadder } from '../../../../../../lib/titleLadderInput';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * PUT /api/instructor/quizzes/:activityType/titles — sets the mastery titles for one catalog.
 *
 * Titles can also be authored when the catalog is created (POST /api/activities/types), but that
 * alone would make a typo permanent and would leave every catalog created before this feature
 * without any way to get a ladder at all.
 *
 * Nothing here grants anything to a student. A title is earned by passing a level and resolved on
 * read (lib/titleQueries.ts's computeStudentTitles), so saving a ladder retroactively gives each
 * rung to everyone who already passed that level — which is the intended behaviour, not a side
 * effect to guard against.
 *
 * Ownership uses the same 404-then-403 ordering as GET on the route beside it: getQuizByActivityType
 * is deliberately unscoped by creator, so this route does the check itself. A built-in catalog
 * (creator_id IS NULL) therefore has no owner and can never be edited here.
 *
 * - 400 malformed titles payload (see lib/titleLadderInput.ts)
 * - 401 missing/invalid bearer token
 * - 403 not an instructor, or doesn't own this catalog (no body)
 * - 404 activityType matches no catalog
 * - 200 { titles: StoredTitleRung[] } — the ladder as stored afterwards, re-read rather than echoed
 * - 500 Supabase not configured, or a query fails
 */
export async function PUT(request: Request, { params }: { params: { activityType: string } }) {
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

  const ladder = validateTitleLadder((body as { titles?: unknown } | null)?.titles);
  if (!ladder.ok) return Response.json({ error: ladder.error }, { status: 400 });

  const { activityType } = params;

  const { quiz, creatorId, error: quizError } = await getQuizByActivityType(supabase, activityType);
  if (quizError) return Response.json({ error: quizError.message }, { status: 500 });
  if (!quiz) return Response.json({ error: 'Catalog not found.' }, { status: 404 });
  if (creatorId !== guard.user_id) return new Response(null, { status: 403 });

  const { error: saveError } = await saveTitleLadder(supabase, activityType, ladder.rungs);
  if (saveError) return Response.json({ error: saveError.message }, { status: 500 });

  // Re-read instead of echoing the request back: the upsert keeps the existing row (and its
  // title_definition_id) on conflict, so what is stored is the only trustworthy answer to "what
  // does this ladder look like now".
  const { rungs, error: reloadError } = await loadTitleLadder(supabase, activityType);
  if (reloadError || !rungs) {
    return Response.json({ error: reloadError?.message ?? 'Could not load titles.' }, { status: 500 });
  }

  return Response.json({ titles: rungs }, { status: 200 });
}
