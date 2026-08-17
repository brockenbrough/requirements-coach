import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import { validateUserStoryInput } from '../../../../lib/userStoryInput';
import { createUserStory } from '../../../../lib/userStoryAuthoringQueries';
import type { InstructorUserStoryEntry } from '../../../../lib/llmActivityTypes';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

type UserStoryRow = {
  user_story_id: string;
  story_text: string;
  difficulty_level: number;
  activity_type: string;
};

/**
 * GET /api/instructor/user-stories — every user_story row the calling instructor authored
 * (GitHub #225), for a future "my user stories" review page mirroring GET
 * /api/instructor/questions (GitHub #170).
 *
 * Scoped to the caller via user_story.creator_id, unlike /api/instructor/questions (which
 * deliberately returns the whole question bank) — a student is only ever shown one random
 * user_story at a time, so there's no analogous "whole bank" browsing use case here to match,
 * and creator_id is exactly the identity requireInstructor already confirms.
 *
 * An empty list is a 200, not a 404 — an instructor who hasn't authored any stories yet is a
 * normal state.
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

  const { data, error } = await supabase
    .from('user_story')
    .select('user_story_id, story_text, difficulty_level, activity_type')
    .eq('creator_id', guard.user_id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const stories: InstructorUserStoryEntry[] = ((data ?? []) as UserStoryRow[]).map((row) => ({
    id: row.user_story_id,
    storyText: row.story_text,
    difficultyLevel: row.difficulty_level as 1 | 2 | 3,
    activityType: row.activity_type as InstructorUserStoryEntry['activityType'],
  }));

  return Response.json({ stories }, { status: 200 });
}

/**
 * POST /api/instructor/user-stories — adds a prompt to an LLM-graded catalog (GitHub #379), the
 * counterpart to POST /api/instructor/questions for the other half of the activity_type table.
 * Until this existed, user_story rows could only arrive through supabase/seed.sql, which is why an
 * instructor-created LLM-graded activity had no way to be given any content.
 *
 * Body: { storyText, activityType, difficultyLevel }
 * - activityType must be an existing key whose grading_kind is 'llm-graded'. A prompt on an MCQ
 *   catalog would be invisible to every code path (the MCQ draw reads `question`), so it is
 *   refused rather than silently stored — the invariant schema.sql notes Postgres can't express,
 *   enforced here instead.
 * - difficultyLevel is required and is a real pool selector, not decoration: the LLM session draw
 *   filters user_story by it exactly the way the MCQ draw filters question.
 * - creator_id is taken from the authenticated instructor, never the body. It also decides which
 *   instructor_llm_config grades submissions against this prompt, which is why the seeded
 *   (creator_id NULL) set is ungradable.
 *
 * Two deliberate differences from the questions route, both because user_story is a leaf table:
 * there is no order_number to auto-assign (the column doesn't exist — prompts are ordered by level
 * then text), and there is no rollbackAndFail, because a prompt has no answer/question_to_answer
 * children that a partial write could orphan. One insert, one outcome.
 *
 * Returns 201 with { userStoryId }.
 */
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const token = getToken(request);
  const guard = await requireInstructor(supabase, token);
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

  const { storyText, activityType, difficultyLevel } = (body ?? {}) as {
    storyText?: unknown;
    activityType?: unknown;
    difficultyLevel?: unknown;
  };

  const validation = await validateUserStoryInput(supabase, { storyText, activityType, difficultyLevel });
  if (!validation.ok) return validation.response;

  const { data: { user }, error: authError } = await supabase.auth.getUser(token!);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const created = await createUserStory(
    supabase,
    { storyText: validation.storyText, activityType: validation.activityType, difficultyLevel: validation.difficultyLevel },
    user.id,
  );
  if (!created.ok) return Response.json({ error: created.error }, { status: created.status });

  return Response.json({ userStoryId: created.userStoryId }, { status: 201 });
}
