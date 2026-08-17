import { getSupabaseClient } from '../../../../../lib/supabase';
import { requireInstructor } from '../../../../../lib/instructorAuth';
import { listOwnedActivityTypes } from '../../../../../lib/activityTypeQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

type SubmissionRow = {
  submission_id: string;
  user_id: string;
  submitted_text: string;
  llm_score: number | null;
  llm_feedback: string | null;
  submitted_at: string;
  graded_at: string | null;
  student: { user_id: string; first_name: string | null; last_name: string | null; username: string | null; role: string };
  story: { story_text: string; difficulty_level: number; activity_type: string };
};

function studentDisplayName(student: SubmissionRow['student']): string {
  const fullName = [student.first_name, student.last_name].filter(Boolean).join(' ').trim();
  return fullName || student.username || 'Unknown student';
}

/**
 * GET /api/instructor/acceptance-criteria/submissions — AC submissions on the llm-graded activity
 * types this instructor created, optionally filtered to one student via ?studentId= (GitHub
 * #154). Scoped the same way computeAcceptanceCriteriaStatistics is: listOwnedActivityTypes(...,
 * 'llm-graded') first, short-circuiting to an empty list when the instructor owns none — see that
 * function's docstring (lib/acceptanceCriteriaStatisticsQueries.ts) for why this reads empty for
 * every instructor today (WRITE_ACCEPTANCE_CRITERIA is a built-in, creator_id IS NULL).
 *
 * Gated by requireInstructor; uses the service-role client to bypass RLS. The own_submissions_select
 * policy restricts students to their own rows, so a student cannot reach this route at all — but
 * requireInstructor is the explicit gate, not RLS.
 *
 * difficultyLevel (GitHub #276) comes along with the story join so the combined instructor
 * dashboard's Level filter has something real to filter these rows on, the same way it already
 * does for quiz attempts via session_log.difficulty_level.
 *
 * An empty list is a 200.
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

  const { activityTypes: ownedTypes, error: ownedError } = await listOwnedActivityTypes(
    supabase,
    guard.user_id,
    'llm-graded',
  );
  if (ownedError || !ownedTypes) {
    return Response.json({ error: ownedError?.message ?? 'Could not load your catalogs.' }, { status: 500 });
  }
  if (ownedTypes.length === 0) return Response.json({ submissions: [] }, { status: 200 });

  const studentId = new URL(request.url).searchParams.get('studentId');

  let query = supabase
    .from('submission')
    .select(
      'submission_id, submitted_text, llm_score, llm_feedback, submitted_at, graded_at, student:user!inner(user_id, first_name, last_name, username, role), story:user_story!inner(story_text, difficulty_level, activity_type)',
    )
    .eq('student.role', 'student')
    .in('story.activity_type', ownedTypes)
    .order('submitted_at', { ascending: false });

  if (studentId) query = query.eq('user_id', studentId);

  const { data, error } = await query;

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const submissions = (data ?? []).map((row) => {
    const r = row as unknown as SubmissionRow;
    return {
      submissionId: r.submission_id,
      studentId: r.student.user_id,
      studentName: studentDisplayName(r.student),
      userStoryDescription: r.story.story_text,
      difficultyLevel: r.story.difficulty_level,
      submittedText: r.submitted_text,
      llmScore: r.llm_score,
      llmFeedback: r.llm_feedback,
      submittedAt: r.submitted_at,
      gradedAt: r.graded_at,
    };
  });

  return Response.json({ submissions }, { status: 200 });
}
