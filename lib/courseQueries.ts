// Queries for the instructor course routes (REQ-DL-5), so "what a shareable code looks like"
// and "how a code collision is handled" live in exactly one place.

import type { SupabaseClient } from './sessionQueries';

const UNIQUE_VIOLATION = '23505';
const CODE_LENGTH = 6;
// No 0/O/1/I — a code an instructor reads out loud or a student retypes by hand shouldn't hinge
// on telling those apart. Mirrors lib/mockCourses.ts's alphabet — that file's header says this
// route is what it still needs to be superseded by.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// 33^6 ~= 1.29e9 possible codes — a real collision against uq_course_code is exceedingly rare;
// this only bounds the loop so a pathological run can't spin forever.
const MAX_CODE_ATTEMPTS = 5;

function generateCourseCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

/** One course row, exactly as POST /api/instructor/courses discloses it. */
export type CourseRecord = {
  course_id: string;
  course_name: string;
  course_code: string;
  creator_id: string;
  created_at: string;
};

// creator_id is included even though createCourseWithUniqueCode's own response never discloses
// it — findOwnedCourse (below) needs it for every ownership check, and reusing one column list
// keeps the *Queries.ts convention of a single source of truth for "what a course row looks
// like" rather than a second, narrower select just for the create path.
const COURSE_COLUMNS = 'course_id, course_name, course_code, creator_id, created_at';

/**
 * Inserts a new course with a freshly generated code, retrying on a uq_course_code collision
 * (23505) up to MAX_CODE_ATTEMPTS times — each attempt generates a *new* code rather than
 * retrying the same insert. Unlike POST /api/sessions's uq_session_log_one_active race (fetch
 * the row that's already there) or llm-config's uq_instructor_llm_config_one_active race (retry
 * the same insert after deactivating the existing row), a code collision has no existing row to
 * fall back to — the only fix is a different code.
 *
 * course.course_code is nullable in the schema (a codeless course means instructor-assigned, no
 * self-serve join — see REQ-DL-5's schema comment), but this route always generates one: its
 * whole point is handing the instructor something to share.
 *
 * Any non-23505 error fails immediately. Exhausting every attempt on 23505 is reported back as
 * its own error rather than thrown, matching every other *Queries.ts function's { data, error }
 * shape.
 */
export async function createCourseWithUniqueCode(
  supabase: SupabaseClient,
  params: { name: string; creatorId: string },
) {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from('course')
      .insert({
        course_id: crypto.randomUUID(),
        creator_id: params.creatorId,
        course_name: params.name,
        course_code: generateCourseCode(),
      })
      .select(COURSE_COLUMNS)
      .single();

    if (!error) return { course: data as CourseRecord, error: null };
    if (error.code !== UNIQUE_VIOLATION) return { course: null, error };
  }

  return {
    course: null,
    error: { message: `Could not generate a unique course code after ${MAX_CODE_ATTEMPTS} attempts.` },
  };
}

/**
 * Looks up a course by its shareable code (course.course_code, uq_course_code). maybeSingle,
 * not single: an unknown code is a valid outcome (course: null, error: null), not a query
 * failure. Caller normalizes case/whitespace before calling this (see the route).
 */
export async function findCourseByCode(supabase: SupabaseClient, code: string) {
  const { data, error } = await supabase
    .from('course')
    .select(COURSE_COLUMNS)
    .eq('course_code', code)
    .maybeSingle();

  return { course: error ? null : (data as CourseRecord | null), error };
}

/**
 * Links a student to a course (student_course), idempotently. uq_student_course_user_course is
 * a plain (user_id, course_id) unique index, not a status-scoped one like
 * uq_session_log_one_active — on a 23505 the row that already exists *is* the membership being
 * requested, so there's nothing to refetch: return alreadyMember: true directly. Any other
 * error (including 23503 on fk_student_course_user — no "user" row yet) is returned as-is for
 * the route to classify.
 */
export async function enrollStudentInCourse(
  supabase: SupabaseClient,
  params: { userId: string; courseId: string },
) {
  const { error } = await supabase
    .from('student_course')
    .insert({ user_id: params.userId, course_id: params.courseId });

  if (!error) return { alreadyMember: false, error: null };
  if (error.code === UNIQUE_VIOLATION) return { alreadyMember: true, error: null };
  return { alreadyMember: false, error };
}

export type OwnedCourseResult =
  | { status: 'ok'; course: CourseRecord }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'error'; error: { message: string } };

/**
 * Fetches a course by id and checks the caller owns it, in one call. No shared helper like this
 * existed before this file — every other instructor route hand-rolls its own fetch-then-compare
 * (see app/api/instructor/questions/[questionId]/route.ts) — but four course routes need this
 * exact 404-then-403 dance, which is what justifies it here.
 *
 * 403 carries no body, matching requireInstructor's own convention (and
 * app/api/instructor/quizzes/.../questions/route.ts's ownership 403) rather than the
 * { error }-bodied 403 the questions PATCH route uses — the two disagree today; routes built
 * against this helper follow the no-body convention.
 */
export async function findOwnedCourse(
  supabase: SupabaseClient,
  courseId: string,
  instructorId: string,
): Promise<OwnedCourseResult> {
  const { data, error } = await supabase.from('course').select(COURSE_COLUMNS).eq('course_id', courseId).maybeSingle();

  if (error) return { status: 'error', error };
  if (!data) return { status: 'not_found' };

  const course = data as CourseRecord;
  if (course.creator_id !== instructorId) return { status: 'forbidden' };

  return { status: 'ok', course };
}

/**
 * Every course an instructor created, newest first, with a per-course enrollment count via a
 * PostgREST embedded count (student_course(count)) — one query instead of N+1. Supabase returns
 * the count as a one-element array ([{ count: N }]), not a bare number.
 */
export async function listCoursesForInstructor(supabase: SupabaseClient, instructorId: string) {
  const { data, error } = await supabase
    .from('course')
    .select('course_id, course_name, course_code, created_at, student_course(count)')
    .eq('creator_id', instructorId)
    .order('created_at', { ascending: false });

  if (error) return { courses: null, error };

  type CourseWithCountRow = {
    course_id: string;
    course_name: string;
    course_code: string;
    created_at: string;
    student_course: { count: number }[] | null;
  };

  const courses = ((data ?? []) as unknown as CourseWithCountRow[]).map((row) => ({
    course_id: row.course_id,
    course_name: row.course_name,
    course_code: row.course_code,
    created_at: row.created_at,
    student_count: row.student_course?.[0]?.count ?? 0,
  }));

  return { courses, error: null };
}

/** Renames a course. Ownership is checked by the caller (findOwnedCourse) before this runs. */
export async function updateCourseName(supabase: SupabaseClient, params: { courseId: string; name: string }) {
  const { data, error } = await supabase
    .from('course')
    .update({ course_name: params.name })
    .eq('course_id', params.courseId)
    .select(COURSE_COLUMNS)
    .single();

  return { course: error ? null : (data as CourseRecord), error };
}

/**
 * Every student enrolled in a course, with a display name — the roster app/api/instructor/
 * courses/[id]/route.ts's GET merges with attempt/score aggregates. Name fallback mirrors
 * studentDisplayName in lib/sessionQueries.ts exactly (first/last name, else username, else
 * 'Unknown student'), duplicated locally rather than exported cross-file for a one-line helper —
 * same per-file duplication this codebase already accepts for getToken.
 */
export async function loadEnrolledStudents(supabase: SupabaseClient, courseId: string) {
  const { data, error } = await supabase
    .from('student_course')
    .select('user_id, student:user_id(first_name, last_name, username)')
    .eq('course_id', courseId);

  if (error) return { students: null, error };

  type EnrolledRow = {
    user_id: string;
    student: { first_name: string | null; last_name: string | null; username: string | null } | null;
  };

  const students = ((data ?? []) as unknown as EnrolledRow[]).map((row) => {
    const fullName = [row.student?.first_name, row.student?.last_name].filter(Boolean).join(' ').trim();
    return { id: row.user_id, name: fullName || row.student?.username || 'Unknown student' };
  });

  return { students, error: null };
}

/**
 * Unenrolls a student. Idempotent by design: deleting a link that doesn't exist is still a
 * success (error stays null either way) — the end state ("not enrolled") is identical, and the
 * route this backs must not error on a stale double-click of the remove button.
 */
export async function unenrollStudent(supabase: SupabaseClient, params: { courseId: string; studentId: string }) {
  const { error } = await supabase
    .from('student_course')
    .delete()
    .eq('course_id', params.courseId)
    .eq('user_id', params.studentId);

  return { error };
}

export type JoinableCourseRecord = {
  course_id: string;
  course_name: string;
  created_at: string;
  professor_name: string;
  student_count: number;
  already_member: boolean;
};

/**
 * Every course a student can self-enroll in by code (course_code IS NOT NULL — a codeless
 * course is instructor-assigned only, REQ-DL-5) plus a per-caller alreadyMember flag. The code
 * itself is never selected, let alone returned — it's a secret the instructor hands out
 * directly, and this query only needs to filter on it, never disclose its value.
 *
 * Two queries, merged in JS, rather than one filtered embed: student_course rows for every
 * *other* enrolled student are never fetched at all, only the caller's own — the response this
 * backs must never disclose which other students are in a course, only whether the caller is.
 * professor_name's fallback chain mirrors loadEnrolledStudents's exactly (first/last name, else
 * username, else a fixed fallback).
 */
export async function listJoinableCourses(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('course')
    .select('course_id, course_name, created_at, creator:creator_id(first_name, last_name, username), student_course(count)')
    .not('course_code', 'is', null)
    .order('created_at', { ascending: false });

  if (error) return { courses: null, error };

  const { data: memberships, error: membershipError } = await supabase
    .from('student_course')
    .select('course_id')
    .eq('user_id', userId);

  if (membershipError) return { courses: null, error: membershipError };

  const memberIds = new Set(((memberships ?? []) as { course_id: string }[]).map((m) => m.course_id));

  type Row = {
    course_id: string;
    course_name: string;
    created_at: string;
    creator: { first_name: string | null; last_name: string | null; username: string | null } | null;
    student_course: { count: number }[] | null;
  };

  const courses: JoinableCourseRecord[] = ((data ?? []) as unknown as Row[]).map((row) => {
    const fullName = [row.creator?.first_name, row.creator?.last_name].filter(Boolean).join(' ').trim();
    return {
      course_id: row.course_id,
      course_name: row.course_name,
      created_at: row.created_at,
      professor_name: fullName || row.creator?.username || 'Unknown instructor',
      student_count: row.student_course?.[0]?.count ?? 0,
      already_member: memberIds.has(row.course_id),
    };
  });

  return { courses, error: null };
}

/**
 * Every course a user is enrolled in (student_course), as bare ids. The building block for
 * "does this student share a course with that one" — GET /api/students/{id}/public-profile uses
 * this to get the target's course list before checking the caller against it (isEnrolledInAnyCourse
 * below), the same two-step shape listJoinableCourses already uses for its own membership check.
 */
export async function getEnrolledCourseIds(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from('student_course').select('course_id').eq('user_id', userId);

  if (error) return { courseIds: null, error };

  return { courseIds: ((data ?? []) as { course_id: string }[]).map((row) => row.course_id), error: null };
}

/**
 * Whether a user is enrolled in any of the given courses — the one membership check
 * GET /api/courses/{courseId}/leaderboard (a single-course list: "is the caller in *this*
 * course") and GET /api/students/{id}/public-profile (the target's full course list: "does the
 * caller share *any* course with them") both reduce to, so a change to what "enrolled" means
 * can't drift between the two routes.
 *
 * courseIds: [] short-circuits to not-enrolled without a query — nothing to be a member of.
 */
export async function isEnrolledInAnyCourse(supabase: SupabaseClient, userId: string, courseIds: string[]) {
  if (courseIds.length === 0) return { enrolled: false, error: null };

  const { data, error } = await supabase
    .from('student_course')
    .select('course_id')
    .eq('user_id', userId)
    .in('course_id', courseIds)
    .limit(1);

  if (error) return { enrolled: false, error };

  return { enrolled: (data ?? []).length > 0, error: null };
}

/**
 * Deletes a course (GitHub #327). One statement, not two: student_course is the only table in
 * the schema with a foreign key to course, and fk_student_course_course carries ON DELETE
 * CASCADE, so every enrollment goes with it inside the same transaction — there is no way to
 * leave an orphaned student_course row behind.
 *
 * Nothing else is touched, because nothing else *can* be: session_log has no course_id at all
 * (a session belongs to a (user_id, activity_type) pair), and neither does question, whose
 * user_id names its author rather than a course. A student's attempt history, score, title and
 * streak therefore survive the deletion of a course they were in — which is what #327's own
 * "keep session rows, only remove enrollment and visibility" recommendation asks for.
 *
 * Not idempotent the way unenrollStudent is: callers run findOwnedCourse first, so a second
 * delete of the same course is a 404 there rather than a silent no-op here.
 */
export async function deleteCourse(supabase: SupabaseClient, courseId: string) {
  const { error } = await supabase.from('course').delete().eq('course_id', courseId);

  return { error };
}
