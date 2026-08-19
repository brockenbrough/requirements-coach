import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import { findOwnedCourse, loadEnrolledStudents } from '../../../../../../lib/courseQueries';
import { loadStudentQuestionActivityForIds } from '../../../../../../lib/sessionQueries';
import { toInstant } from '../../../../../../lib/dateTime';
import { toCsv } from '../../../../../../lib/csv';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// userId identifies the student by their account id (REQ-PL-3.4.3: "This ID could possibly be
// the user record ID") rather than by name — no studentName column. As of REQ-PL-3.4.5, one row
// is one question/prompt drawn in a session (not one row per session): activityType is renamed
// Catalog for the reader, the session-level columns are repeated on every one of its question
// rows, and Question/Question Text/Answer describe that specific question and the student's
// submitted answer to it.
const EXPORT_COLUMNS = [
  'userId',
  'Catalog',
  'difficultyLevel',
  'status',
  'startedAt',
  'endedAt',
  'cumulativeScore',
  'maxScore',
  'passed',
  'questionCount',
  'answeredCount',
  'Question',
  'Question Text',
  'Answer',
];

/**
 * GET /api/instructor/courses/{id}/export — a CSV, identified by student account id rather than
 * name, of every question/prompt drawn for students enrolled in a course the calling instructor
 * owns (REQ-PL-3.4.3, REQ-PL-3.4.5). The "class code" in the requirement is this app's
 * course_code (REQ-DL-5) — the only implemented grouping of students under an instructor-issued
 * code; REQ-DL-3.4.1's separate class_code table (entered at student registration) doesn't exist
 * in this schema.
 *
 * Reuses loadStudentQuestionActivityForIds (already built for this export) rather than a new
 * query — same session-level fields loadStudentActivityForIds (the course roster page's query)
 * returns, just repeated onto one row per question/prompt drawn in that session instead of
 * collapsed into a single row per session.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor (no body)
 * - 404 course doesn't exist
 * - 403 course exists but isn't owned by the caller (no body)
 * - 200 text/csv, one row per question/prompt drawn in a session, Content-Disposition: attachment
 * - 500 Supabase not configured, or any query failure
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
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

  const found = await findOwnedCourse(supabase, params.id, guard.user_id);
  if (found.status === 'error') return Response.json({ error: found.error.message }, { status: 500 });
  if (found.status === 'not_found') return Response.json({ error: 'Course not found.' }, { status: 404 });
  if (found.status === 'forbidden') return new Response(null, { status: 403 });

  const { students: enrolled, error: rosterError } = await loadEnrolledStudents(supabase, params.id);
  if (rosterError || !enrolled) {
    return Response.json({ error: rosterError?.message ?? 'Could not load roster.' }, { status: 500 });
  }

  const { rows: activities, error: activityError } = await loadStudentQuestionActivityForIds(
    supabase,
    enrolled.map((s) => s.id),
  );
  if (activityError || !activities) {
    return Response.json({ error: (activityError as { message?: string })?.message ?? 'Could not load student activity.' }, { status: 500 });
  }

  const rows = activities.map((a) => [
    a.userId,
    a.activityType,
    a.difficultyLevel,
    a.status,
    toInstant(a.startedAt),
    a.endedAt ? toInstant(a.endedAt) : null,
    a.cumulativeScore,
    a.maxScore,
    a.passed,
    a.questionCount,
    a.answeredCount,
    `Question ${a.questionNumber}`,
    a.questionText,
    a.answerText,
  ]);

  const csv = toCsv(EXPORT_COLUMNS, rows);

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="course-${found.course.course_code}-report.csv"`,
    },
  });
}
