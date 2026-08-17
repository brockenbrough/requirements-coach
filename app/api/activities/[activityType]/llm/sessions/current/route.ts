import { getSupabaseClient } from '../../../../../../../lib/supabase';
import {
  loadSessionStories,
  loadSessionSubmissions,
  nextUnansweredStoryPosition,
} from '../../../../../../../lib/llmActivityQueries';
import { findInProgressSession } from '../../../../../../../lib/sessionQueries';
import { getGradingKind } from '../../../../../../../lib/activityTypes';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/activities/:activityType/llm/sessions/current — resumes the running session for one
 * LLM-graded activity (GitHub #379), the equivalent of GET /api/sessions/current. A pure read:
 * the server is already up to date after every submission, so there is nothing to merge, whether
 * this is a reload, a second device, or days later.
 *
 * Deliberately no checkActivityAccess, unlike the start route. The query is already scoped to the
 * caller's own session rows, so there is nothing here another student could reach; and for a
 * student unenrolled mid-session, "nothing is running" is a worse answer than the session they
 * are actually holding. The start route is where enrollment decides anything.
 */
export async function GET(request: Request, { params }: { params: { activityType: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { activityType } = params;

  // Guarded so a mistyped or MCQ activityType is a clear error rather than a permanent, silent
  // "nothing in progress" — which is what the empty answer below would otherwise look like.
  const { gradingKind, error: kindError } = await getGradingKind(supabase, activityType);
  if (kindError) return Response.json({ error: kindError.message }, { status: 500 });
  if (gradingKind === null) return Response.json({ error: 'Unknown activity type.' }, { status: 400 });
  if (gradingKind !== 'llm-graded') {
    return Response.json(
      { error: 'This activity is a multiple-choice quiz — resume it with GET /api/sessions/current.' },
      { status: 400 },
    );
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { session, error: sessionError } = await findInProgressSession(supabase, user.id, activityType);
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
