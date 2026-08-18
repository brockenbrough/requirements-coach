import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import { listTitleNames } from '../../../../lib/titleAuthoringQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/titles — every distinct mastery title name in use, for the suggestion list
 * behind the authoring form's title fields.
 *
 * Not scoped to the caller's own catalogs, unlike GET /api/instructor/quizzes: reusing a colleague's
 * "Story Apprentice" instead of inventing a synonym is the entire point, and a bare title name
 * discloses neither who wrote it nor which students hold it. What comes back is a name to copy,
 * not a row to share — a title_definition row belongs to one (activity_type, difficulty_level)
 * pair, so picking an existing name still writes a new row for the catalog being edited.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor (no body)
 * - 200 { titleNames: string[] }
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

  const { titleNames, error } = await listTitleNames(supabase);
  if (error || !titleNames) {
    return Response.json({ error: error?.message ?? 'Could not load titles.' }, { status: 500 });
  }

  return Response.json({ titleNames }, { status: 200 });
}
