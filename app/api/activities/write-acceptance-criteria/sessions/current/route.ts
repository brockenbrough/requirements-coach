import { getSupabaseClient } from '../../../../../../lib/supabase';
import {
  findInProgressAcSession,
  loadSessionStories,
  loadSessionSubmissions,
  nextUnansweredStoryPosition,
} from '../../../../../../lib/llmActivityQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/activities/write-acceptance-criteria/sessions/current — resumes the running session,
 * the AC equivalent of GET /api/sessions/current. A pure read: the server is already up to date
 * after every submission, so there is nothing to merge, whether this is a reload, a second
 * device, or days later.
 */
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { session, error: sessionError } = await findInProgressAcSession(supabase, user.id);
  if (sessionError) return Response.json({ error: sessionError.message }, { status: 500 });

  // Nothing in progress is a normal answer, not a 404 — the client offers Start instead of
  // Resume/Abandon and can tell the two apart without inspecting a status code.
  if (!session) {
    return Response.json(
      { session: null, stories: [], submissions: [], answeredCount: 0, nextPosition: null },
      { status: 200 },
    );
  }

  const sessionId = (session as { session_id: string }).session_id;

  const [storyResult, submissionResult] = await Promise.all([
    loadSessionStories(supabase, sessionId),
    loadSessionSubmissions(supabase, sessionId),
  ]);

  if (storyResult.error) return Response.json({ error: storyResult.error.message }, { status: 500 });
  if (submissionResult.error) return Response.json({ error: submissionResult.error.message }, { status: 500 });

  const stories = storyResult.stories ?? [];
  const submissions = submissionResult.submissions ?? [];

  const submittedStoryIds = new Set(submissions.map((submission) => submission.userStoryId));
  const nextPosition = nextUnansweredStoryPosition(stories, submittedStoryIds);

  return Response.json(
    {
      session,
      stories,
      submissions,
      answeredCount: submittedStoryIds.size,
      nextPosition,
      completed: nextPosition === null,
    },
    { status: 200 },
  );
}
