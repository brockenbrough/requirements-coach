import { getSupabaseClient } from '../../../../../lib/supabase';
import { shuffleArray } from '../../../../../lib/shuffleArray';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/activities/write-acceptance-criteria/user-story
 *
 * Returns one random user story for the student to write acceptance criteria against
 * (REQ-FU-2). Nothing is persisted here — like the MCQ session's current question
 * (lib/sessionQueries.ts's nextUnansweredPosition), "current story" is derived fresh on
 * every call rather than stored; the submission route is what pins a later answer to the
 * story shown.
 *
 * user_story has no title/description columns yet, only story_text — the response maps
 * story_text to `description` and omits `title` until the schema grows one.
 *
 * AC summary:
 *  - 401 if the bearer token is missing or invalid
 *  - 500 if Supabase is not configured, the query fails, or user_story has no rows
 *  - 200 with { userStoryId, description }
 */
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { data: stories, error } = await supabase
    .from('user_story')
    .select('user_story_id, story_text');

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (!stories || stories.length === 0) {
    return Response.json({ error: 'No user stories available.' }, { status: 500 });
  }

  const [story] = shuffleArray(stories as { user_story_id: string; story_text: string }[]);

  return Response.json(
    { userStoryId: story.user_story_id, description: story.story_text },
    { status: 200 },
  );
}
