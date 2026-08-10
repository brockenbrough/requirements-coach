import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import type { InstructorUserStoryEntry } from '../../../../lib/acceptanceCriteriaTypes';

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
