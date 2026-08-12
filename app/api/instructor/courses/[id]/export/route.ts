import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import { findOwnedCourse, loadEnrolledStudents } from '../../../../../../lib/courseQueries';
import { loadStudentActivityForIds } from '../../../../../../lib/sessionQueries';
import { toInstant } from '../../../../../../lib/dateTime';
import { toCsv } from '../../../../../../lib/csv';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// studentId is the "user"."user_id" UUID, never studentName — this is the depersonalization
// REQ-PL-3.4.3 asks for: a consistent per-student ID a researcher can group by, with no name
// column anywhere in the file. sessionId is likewise just an opaque per-attempt identifier.
const EXPORT_COLUMNS = [
  'studentId',
  'sessionId',
  'activityType',
  'difficultyLevel',
  'status',
  'startedAt',
  'endedAt',
  'cumulativeScore',
  'maxScore',
  'passed',
  'questionCount',
  'answeredCount',
  'badgeId',
];

/**
 * GET /api/instructor/courses/{id}/export — a depersonalized CSV of every attempt made by
 * students enrolled in a course the calling instructor owns (REQ-PL-3.4.3). The "class code" in
 * the requirement is this app's course_code (REQ-DL-5) — the only implemented grouping of
 * students under an instructor-issued code; REQ-DL-3.4.1's separate class_code table (entered
 * at student registration) doesn't exist in this schema.
 *
 * Reuses loadStudentActivityForIds (already built for the course roster page) rather than a new
 * query — same session-level rows the roster's per-student summary is computed from, just
 * un-aggregated and with studentName stripped before it ever reaches the response.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor (no body)
 * - 404 course doesn't exist
 * - 403 course exists but isn't owned by the caller (no body)
 * - 200 text/csv, one row per session_log attempt, Content-Disposition: attachment
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

  const { activities, error: activityError } = await loadStudentActivityForIds(
    supabase,
    enrolled.map((s) => s.id),
  );
  if (activityError || !activities) {
    return Response.json({ error: activityError?.message ?? 'Could not load student activity.' }, { status: 500 });
  }

  const rows = activities.map((a) => [
    a.studentId,
    a.session_id,
    a.activity_type,
    a.difficulty_level,
    a.status,
    toInstant(a.started_at),
    a.ended_at ? toInstant(a.ended_at) : null,
    a.cumulative_score,
    a.max_score,
    a.passed,
    a.questionCount,
    a.answeredCount,
    a.badge_id,
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
