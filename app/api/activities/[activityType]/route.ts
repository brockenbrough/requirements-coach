import { getSupabaseClient } from '../../../../lib/supabase';
import { getQuizByActivityType } from '../../../../lib/activityTypeQueries';
import { getCourseForActivityType } from '../../../../lib/activityCourseQueries';
import { isEnrolledInAnyCourse } from '../../../../lib/courseQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/activities/:activityType — one activity's own display metadata, for a student
 * reaching a course-scoped custom catalog directly (app/activities/[slug]/page.tsx falls back to
 * this when the slug isn't one of the three built-ins lib/activityContent.ts knows statically).
 * The single-activity counterpart to GET /api/activities' list.
 *
 * 404-then-403 like GET /api/courses/{courseId}/leaderboard: an unknown activityType is a
 * missing resource (404) before enrollment is even considered; one that exists but isn't linked
 * to a course the caller is enrolled in is 403 — "no course link at all" and "wrong course" both
 * collapse to the same 403, so neither leaks which unlinked activities exist. Fetches the course
 * link once (getCourseForActivityType) rather than going through checkActivityAccess and then
 * re-fetching the same link for the response — the other two routes that use checkActivityAccess
 * (POST /api/sessions, GET /api/activities/{activityType}/questions) only need the boolean
 * outcome, this one also needs the link's own courseId/courseName to answer with.
 *
 * - 401 missing/invalid bearer token
 * - 404 activityType matches no catalog
 * - 403 caller isn't enrolled in the course this activity is linked to
 * - 200 { activity: { activityType, name, description, gradingKind, courseId, courseName } }
 * - 500 Supabase not configured, or a query fails
 */
export async function GET(request: Request, { params }: { params: { activityType: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { activityType } = params;

  const { quiz, error: quizError } = await getQuizByActivityType(supabase, activityType);
  if (quizError) return Response.json({ error: quizError.message }, { status: 500 });
  if (!quiz) return Response.json({ error: 'Activity not found.' }, { status: 404 });

  const { link, error: linkError } = await getCourseForActivityType(supabase, activityType);
  if (linkError) return Response.json({ error: linkError.message }, { status: 500 });
  if (!link) return new Response(null, { status: 403 });

  const { enrolled, error: enrollError } = await isEnrolledInAnyCourse(supabase, user.id, [link.courseId]);
  if (enrollError) return Response.json({ error: enrollError.message }, { status: 500 });
  if (!enrolled) return new Response(null, { status: 403 });

  return Response.json(
    {
      activity: {
        activityType: quiz.activityType,
        name: quiz.name,
        description: quiz.description,
        // GitHub #379: which play flow the client should enter. buildCustomActivityDefinition
        // reads this straight off the response, so a custom LLM-graded catalog reached by its raw
        // key lands in the free-text flow instead of the MCQ one.
        gradingKind: quiz.gradingKind,
        courseId: link.courseId,
        courseName: link.courseName,
      },
    },
    { status: 200 },
  );
}
