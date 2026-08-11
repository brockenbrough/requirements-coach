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
  created_at: string;
};

const COURSE_COLUMNS = 'course_id, course_name, course_code, created_at';

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
