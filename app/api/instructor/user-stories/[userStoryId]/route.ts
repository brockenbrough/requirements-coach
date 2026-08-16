import { getSupabaseClient } from '../../../../../lib/supabase';
import { requireInstructor } from '../../../../../lib/instructorAuth';
import { validateUserStoryInput } from '../../../../../lib/userStoryInput';
import type { SupabaseClient } from '../../../../../lib/sessionQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

type OwnershipResult =
  | { ok: true }
  | { ok: false; response: Response };

/**
 * The 404-then-403 preamble PATCH and DELETE share, mirroring the question routes' own inline
 * copy: an unknown id is a missing resource before ownership is even considered, and a prompt
 * someone else authored is a 403 rather than a 404 — the catalog it lives in is public to every
 * instructor (catalogs are shared), so its existence is not a secret worth hiding.
 */
async function requireOwnedUserStory(
  supabase: SupabaseClient,
  userStoryId: string,
  callerId: string,
): Promise<OwnershipResult> {
  const { data, error } = await supabase
    .from('user_story')
    .select('user_story_id, creator_id')
    .eq('user_story_id', userStoryId)
    .maybeSingle();

  if (error) return { ok: false, response: Response.json({ error: error.message }, { status: 500 }) };
  if (!data) return { ok: false, response: Response.json({ error: 'Prompt not found.' }, { status: 404 }) };

  // A seeded prompt has creator_id NULL and is therefore owned by nobody — not editable through
  // this route by any instructor, which is the same answer the grading path already gives it.
  if ((data as { creator_id: string | null }).creator_id !== callerId) {
    return { ok: false, response: Response.json({ error: 'You do not own this prompt.' }, { status: 403 }) };
  }

  return { ok: true };
}

/**
 * PATCH /api/instructor/user-stories/{userStoryId} — edits a prompt (GitHub #379), the
 * LLM-graded counterpart to PATCH /api/instructor/questions/{questionId}.
 *
 * Body: { storyText, activityType, difficultyLevel } — the same shape POST takes, validated by the
 * same lib/userStoryInput.ts helper, so the two routes cannot drift on what a prompt may attach to.
 *
 * Editing a prompt a student has already answered is deliberately allowed, unlike DELETE below:
 * the submission row keeps its own submitted_text, llm_score and llm_feedback, so past attempts
 * stay intact and readable; only future draws see the new wording. Refusing would leave a typo
 * permanently uncorrectable the moment one student answered it.
 *
 * Returns 200 with { userStoryId }.
 */
export async function PATCH(request: Request, { params }: { params: { userStoryId: string } }) {
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

  const { userStoryId } = params;

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

  const ownership = await requireOwnedUserStory(supabase, userStoryId, guard.user_id);
  if (!ownership.ok) return ownership.response;

  const { error: updateError } = await supabase
    .from('user_story')
    .update({
      story_text: validation.storyText,
      activity_type: validation.activityType,
      difficulty_level: validation.difficultyLevel,
    })
    .eq('user_story_id', userStoryId);

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  return Response.json({ userStoryId }, { status: 200 });
}

/**
 * DELETE /api/instructor/user-stories/{userStoryId} — removes a prompt from its catalog
 * (GitHub #379).
 *
 * A prompt that has already reached a student is refused with 409. Two separate checks, where the
 * question route needs only one:
 *
 * - session_to_user_story: the prompt was drawn into a session.
 * - submission: the prompt was actually answered.
 *
 * submission is not implied by session_to_user_story, because submission.session_id is nullable —
 * a submission can exist without a draw row. Both FKs (fk_session_to_user_story_user_story,
 * fk_submission_user_story) carry no ON DELETE clause, so either would fail at the database
 * anyway; checking first turns a raw constraint error into an explanation.
 *
 * Unlike the question route there is nothing to unlink first: user_story is a leaf, with no
 * answer/question_to_answer equivalent to clean up.
 *
 * Returns 200 with { userStoryId } on success.
 */
export async function DELETE(request: Request, { params }: { params: { userStoryId: string } }) {
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

  const { userStoryId } = params;

  const ownership = await requireOwnedUserStory(supabase, userStoryId, guard.user_id);
  if (!ownership.ok) return ownership.response;

  const { data: drawn, error: drawnError } = await supabase
    .from('session_to_user_story')
    .select('session_to_user_story_id')
    .eq('user_story_id', userStoryId)
    .maybeSingle();

  if (drawnError) return Response.json({ error: drawnError.message }, { status: 500 });

  const { data: answered, error: answeredError } = await supabase
    .from('submission')
    .select('submission_id')
    .eq('user_story_id', userStoryId)
    .maybeSingle();

  if (answeredError) return Response.json({ error: answeredError.message }, { status: 500 });

  if (drawn || answered) {
    return Response.json(
      { error: 'This prompt has already been used in a student session and cannot be deleted.' },
      { status: 409 },
    );
  }

  const { error: deleteError } = await supabase.from('user_story').delete().eq('user_story_id', userStoryId);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });

  return Response.json({ userStoryId }, { status: 200 });
}
