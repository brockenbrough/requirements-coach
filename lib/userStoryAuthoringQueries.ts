import type { SupabaseClient } from './sessionQueries';

/**
 * Shared user_story-creation logic behind POST /api/instructor/user-stories (GitHub #379) and
 * POST /api/instructor/assembled-quizzes/{quizId}/user-stories (the llm-graded create-and-hand-
 * pick twin of .../[quizId]/questions). Extracted for the same reason
 * lib/questionAuthoringQueries.ts was: both routes need the identical insert, and having it in one
 * place is what keeps them from drifting apart the way the two MCQ routes' hand-duplicated
 * validation block does (that duplication is deliberate there — see that file's own docblock —
 * but this insert has no such need to differ between callers).
 */

export type CreateUserStoryInput = { storyText: string; activityType: string; difficultyLevel: 1 | 2 | 3 };

export type CreateUserStoryResult =
  | { ok: true; userStoryId: string }
  | { ok: false; status: number; error: string };

/** Inserts the user_story row. No child rows and no rollback machinery needed — a prompt has no answers/question_to_answer to orphan. */
export async function createUserStory(
  supabase: SupabaseClient,
  input: CreateUserStoryInput,
  creatorId: string,
): Promise<CreateUserStoryResult> {
  const userStoryId = crypto.randomUUID();

  const { error } = await supabase.from('user_story').insert({
    user_story_id: userStoryId,
    story_text: input.storyText,
    activity_type: input.activityType,
    difficulty_level: input.difficultyLevel,
    creator_id: creatorId,
  });

  if (error) return { ok: false, status: 500, error: error.message };

  return { ok: true, userStoryId };
}

/**
 * Deletes a just-created user_story — the rollback half of a create-and-hand-pick request whose
 * subsequent hand-pick insert (assembled_quiz_extra_user_story) failed. Safe to call unconditionally
 * on that failure path: the story was just created by the same request, so nothing else could have
 * referenced it yet.
 */
export async function deleteUserStory(supabase: SupabaseClient, userStoryId: string) {
  const { error } = await supabase.from('user_story').delete().eq('user_story_id', userStoryId);
  return { error };
}
