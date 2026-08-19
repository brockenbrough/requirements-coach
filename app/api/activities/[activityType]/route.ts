import { getSupabaseClient } from '../../../../lib/supabase';
import { getQuizByActivityType } from '../../../../lib/activityTypeQueries';
import { getAccessibleCourseForActivity } from '../../../../lib/activityCourseQueries';

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
 * missing resource (404) before access is even considered; one that exists but isn't reachable
 * through any assembled_quiz in a course the caller is enrolled in is 403 — "reachable through no
 * quiz at all" and "only through quizzes in the wrong course" both collapse to the same 403, so
 * neither leaks which catalogs/quizzes exist otherwise. getAccessibleCourseForActivity
 * (lib/activityCourseQueries.ts) is the one call that both answers the access question and, when
 * it says yes, hands back the specific course that granted it, plus display name/description
 * sourced from the assembled quiz itself (not the underlying catalog — see that function's
 * docstring) — the other two routes that use its sibling checkActivityAccess (POST /api/sessions,
 * GET /api/activities/{activityType}/questions) only need the boolean. getQuizByActivityType is
 * still used here, but only for the 404 check and gradingKind (a catalog-level concept an
 * assembled_quiz has no column for) — do not source name/description from it, that's the bug this
 * route used to have.
 *
 * GitHub #583: an optional ?assembledQuizId= disambiguates which of possibly several assembled
 * quizzes composing this catalog the caller means (the ?quiz= a student followed from a course
 * page card) — passed straight through to getAccessibleCourseForActivity, which 403s if it names
 * a quiz that doesn't actually grant access, the same as an unrecognized one would. Omitted ->
 * today's first-match fallback, unchanged for a bare/bookmarked link.
 *
 * - 401 missing/invalid bearer token
 * - 404 activityType matches no catalog
 * - 403 caller has no course granting access to this activity (or the given assembledQuizId doesn't)
 * - 200 { activity: { activityType, name, description, gradingKind, courseId, courseName, assembledQuizId } }
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
  const assembledQuizId = new URL(request.url).searchParams.get('assembledQuizId') ?? undefined;

  const { quiz, error: quizError } = await getQuizByActivityType(supabase, activityType);
  if (quizError) return Response.json({ error: quizError.message }, { status: 500 });
  if (!quiz) return Response.json({ error: 'Activity not found.' }, { status: 404 });

  const { link, error: linkError } = await getAccessibleCourseForActivity(supabase, activityType, user.id, { assembledQuizId });
  if (linkError) return Response.json({ error: linkError.message }, { status: 500 });
  if (!link) return new Response(null, { status: 403 });

  return Response.json(
    {
      activity: {
        activityType: quiz.activityType,
        name: link.name,
        description: link.description,
        // GitHub #379: which play flow the client should enter. buildCustomActivityDefinition
        // reads this straight off the response, so a custom LLM-graded catalog reached by its raw
        // key lands in the free-text flow instead of the MCQ one.
        gradingKind: quiz.gradingKind,
        courseId: link.courseId,
        courseName: link.courseName,
        assembledQuizId: link.assembledQuizId,
      },
    },
    { status: 200 },
  );
}
