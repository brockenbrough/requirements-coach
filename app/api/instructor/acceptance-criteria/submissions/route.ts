import { getSupabaseClient } from '../../../../../lib/supabase';
import { requireInstructor } from '../../../../../lib/instructorAuth';
import { listOwnedActivityTypes } from '../../../../../lib/activityTypeQueries';
import { listCoursesForActivityTypes } from '../../../../../lib/activityCourseQueries';
import { listOwnedCourseIds, loadEnrolledCourseIdsByStudentForCourses } from '../../../../../lib/courseQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

type SubmissionRow = {
  submission_id: string;
  user_id: string;
  session_id: string | null;
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
 * #154). Scoped the same way GET .../acceptance-criteria/statistics resolves its default scope:
 * listOwnedActivityTypes(..., 'llm-graded') first, short-circuiting to an empty list when the
 * instructor owns none. WRITE_ACCEPTANCE_CRITERIA is a built-in (creator_id IS NULL) and never
 * counts as owned; since GitHub #379 an instructor can create their own llm-graded catalog via
 * CreateCatalogModal, so this is empty only for an instructor who genuinely has none yet, not for
 * everyone by construction.
 *
 * Gated by requireInstructor; uses the service-role client to bypass RLS. The own_submissions_select
 * policy restricts students to their own rows, so a student cannot reach this route at all — but
 * requireInstructor is the explicit gate, not RLS.
 *
 * difficultyLevel (GitHub #276) comes along with the story join so the combined instructor
 * dashboard's Level filter has something real to filter these rows on, the same way it already
 * does for quiz attempts via session_log.difficulty_level.
 *
 * courses (GitHub #474) is the same per-catalog course lookup GET /api/instructor/activities
 * attaches to quiz attempts — [] means the catalog isn't linked to any course yet. quizName
 * (GitHub #500 follow-up) rides the same listCoursesForActivityTypes call — the assembled quiz's
 * own name, not the catalog's, so the combined instructor table's QUIZ column doesn't fall back
 * to the raw activity_type key the way it used to.
 *
 * sessionId (submission.session_id) rides along unchanged from the row, not derived — an
 * llm-graded session draws STORIES_PER_SESSION prompts at once, so one attempt at the activity
 * produces several submission rows here, not one. lib/activityLogTypes.ts's toAcSubmissionRow
 * reads this to tell the Instructor Dashboard's roster (summarizeStudents) which submissions
 * belong to the same underlying attempt, so a student who has answered e.g. 8 prompts across 2
 * sessions is counted as 2 attempts, not 8 — before sessionId existed here, every submission row
 * was indistinguishable from a full attempt, and the roster overcounted by exactly that factor.
 *
 * A submission only counts if its catalog is currently reachable via a live
 * assembled_quiz/assembled_quiz_catalog row for a course this instructor owns AND the submitting
 * student is currently enrolled in — the exact same "shared course" filter
 * lib/sessionQueries.ts's loadAllStudentActivity applies to quiz attempts, and for the identical
 * reason: without it, a submission on a catalog whose only linking course was later deleted (or
 * whose submitter has since left that course) would keep counting here forever, since course
 * deletion cascades away student_course and assembled_quiz/assembled_quiz_catalog but never
 * touches submission. Before this, the combined Instructor Dashboard only avoided the symptom via
 * its own client-side ownedEntries filter (course ownership only, not enrollment) — this closes
 * the gap at the source so every reader (the dashboard, and the All Students page, which has no
 * such client-side filter of its own) sees the same correctly-scoped submissions.
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

  const [{ activityTypes: ownedTypes, error: ownedError }, { courseIds: ownedCourseIds, error: courseIdsError }] = await Promise.all([
    listOwnedActivityTypes(supabase, guard.user_id, 'llm-graded'),
    listOwnedCourseIds(supabase, guard.user_id),
  ]);
  if (ownedError || !ownedTypes) {
    return Response.json({ error: ownedError?.message ?? 'Could not load your catalogs.' }, { status: 500 });
  }
  if (courseIdsError || !ownedCourseIds) {
    return Response.json({ error: courseIdsError?.message ?? 'Could not load your courses.' }, { status: 500 });
  }
  if (ownedTypes.length === 0) return Response.json({ submissions: [] }, { status: 200 });

  const studentId = new URL(request.url).searchParams.get('studentId');

  let query = supabase
    .from('submission')
    .select(
      'submission_id, session_id, submitted_text, llm_score, llm_feedback, submitted_at, graded_at, student:user!inner(user_id, first_name, last_name, username, role), story:user_story!inner(story_text, difficulty_level, activity_type)',
    )
    .eq('student.role', 'student')
    .in('story.activity_type', ownedTypes)
    .order('submitted_at', { ascending: false });

  if (studentId) query = query.eq('user_id', studentId);

  const [{ data, error }, coursesResult, enrollmentResult] = await Promise.all([
    query,
    // GitHub #474: same "which course(s) is this catalog linked to" resolution
    // GET /api/instructor/activities uses for quiz attempts, scoped to ownedTypes so this stays
    // one extra round trip regardless of how many submissions there are.
    listCoursesForActivityTypes(supabase, ownedTypes),
    loadEnrolledCourseIdsByStudentForCourses(supabase, ownedCourseIds),
  ]);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { coursesByActivityType, quizNameByActivityType, error: coursesError } = coursesResult;
  if (coursesError) return Response.json({ error: coursesError.message }, { status: 500 });

  const { enrollmentsByStudent, error: enrollmentError } = enrollmentResult;
  if (enrollmentError) return Response.json({ error: enrollmentError.message }, { status: 500 });

  // Only a submission whose catalog is still linked to a course this instructor owns AND the
  // submitting student is still enrolled in counts — see this route's own doc comment above.
  const rows = ((data ?? []) as unknown as SubmissionRow[]).filter((row) => {
    const linkedCourses = coursesByActivityType!.get(row.story.activity_type) ?? [];
    const enrolledCourseIds = enrollmentsByStudent!.get(row.student.user_id);
    return !!enrolledCourseIds && linkedCourses.some((course) => enrolledCourseIds.has(course.courseId));
  });

  const submissions = rows.map((r) => {
    return {
      submissionId: r.submission_id,
      sessionId: r.session_id,
      studentId: r.student.user_id,
      studentName: studentDisplayName(r.student),
      userStoryDescription: r.story.story_text,
      activityType: r.story.activity_type,
      difficultyLevel: r.story.difficulty_level,
      submittedText: r.submitted_text,
      llmScore: r.llm_score,
      llmFeedback: r.llm_feedback,
      submittedAt: r.submitted_at,
      gradedAt: r.graded_at,
      courses: coursesByActivityType!.get(r.story.activity_type) ?? [],
      quizName: quizNameByActivityType!.get(r.story.activity_type) ?? null,
    };
  });

  return Response.json({ submissions }, { status: 200 });
}
