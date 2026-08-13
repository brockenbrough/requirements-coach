// Queries shared by the session routes, so "which question comes next" and "what may the
// client see" are answered in exactly one place.

import { getSupabaseClient } from './supabase';
import {
  DEFAULT_QUESTION_MAX_SCORE,
  MAX_DIFFICULTY_LEVEL,
  SESSION_COLUMNS,
  START_DIFFICULTY_LEVEL,
  highestPassedLevelByType,
  type PassedSessionRow,
} from './sessionRules';
import type { InstructorActivityEntry, InstructorSessionEntry, SessionListEntry, SessionRecord } from './sessionTypes';
import { shuffleArray } from './shuffleArray';

export type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseClient>>;

// Answer options are never sent with is_correct — the server grades, the client does not.
const SESSION_QUESTION_COLUMNS = `
  position,
  question:question_id (
    question_id,
    question_prompt,
    difficulty_level,
    activity_type,
    max_score,
    question_to_answer (
      answer:answer_id ( answer_id, option_text )
    )
  )
`;

// is_correct and explanation are only ever disclosed for options the student already
// submitted, which is why they live on this query and not on the one above.
const SESSION_ANSWER_COLUMNS = `
  question_id,
  submitted_option,
  score,
  submitted_at,
  answer:submitted_option ( is_correct, explanation )
`;

type QuestionRow = {
  position: number;
  question: {
    question_id: string;
    question_prompt: string;
    difficulty_level: number;
    activity_type: string;
    max_score: number | null;
    question_to_answer: { answer: { answer_id: string; option_text: string } | null }[] | null;
  } | null;
};

type AnswerRow = {
  question_id: string;
  submitted_option: string;
  score: number;
  submitted_at: string;
  answer: { is_correct: boolean; explanation: string | null } | null;
};

export type SessionPosition = { position: number; question_id: string };

export type QuestionOption = {
  answer_id: string;
  option_text: string;
  explanation: string | null;
  is_correct: boolean;
};

/** The student's running session for one activity type, or null. */
export async function findInProgressSession(
  supabase: SupabaseClient,
  userId: string,
  activityType: string,
) {
  const { data, error } = await supabase
    .from('session_log')
    .select(SESSION_COLUMNS)
    .eq('user_id', userId)
    .eq('activity_type', activityType)
    .eq('status', 'in-progress')
    .maybeSingle();

  return { session: error ? null : data, error };
}

/**
 * Where a new session for activityType should start: one level past the highest difficulty_level
 * this student has passed for that activity type, capped at MAX_DIFFICULTY_LEVEL. No prior passed
 * session -> START_DIFFICULTY_LEVEL, unchanged.
 */
export async function findStartDifficultyLevel(
  supabase: SupabaseClient,
  userId: string,
  activityType: string,
) {
  const { data, error } = await supabase
    .from('session_log')
    .select('activity_type, difficulty_level, passed')
    .eq('user_id', userId)
    .eq('activity_type', activityType);

  if (error) return { startLevel: null, error };

  const highestPassed = highestPassedLevelByType((data ?? []) as PassedSessionRow[]);
  const highestPassedLevel = highestPassed.get(activityType) ?? null;
  const startLevel =
    highestPassedLevel === null ? START_DIFFICULTY_LEVEL : Math.min(highestPassedLevel + 1, MAX_DIFFICULTY_LEVEL);

  return { startLevel, error: null };
}

/**
 * The drawn questions in presentation order, with options but without the solution.
 *
 * GitHub #129: question_to_answer carries no ordering of its own, and supabase/seed.sql always
 * inserts (and maps) the correct answer first — so without shuffling, options[0] is the correct
 * one for every question, every time. Shuffled here, once per fetch, rather than client-side:
 * this is the only place a question's options get assembled before going out over the wire, so
 * every caller (POST /api/sessions on start/resume, GET /api/sessions/current) gets a freshly
 * randomized order on every call — including resuming or restarting the same activity — while
 * the client just renders whatever order it received and never re-shuffles on its own re-renders.
 */
export async function loadSessionQuestions(supabase: SupabaseClient, sessionId: string) {
  const { data, error } = await supabase
    .from('session_to_question')
    .select(SESSION_QUESTION_COLUMNS)
    .eq('session_id', sessionId)
    .order('position', { ascending: true });

  if (error) return { questions: null, error };

  const questions = ((data ?? []) as unknown as QuestionRow[])
    .filter((row) => row.question !== null)
    .map((row) => ({
      position: row.position,
      question_id: row.question!.question_id,
      question_prompt: row.question!.question_prompt,
      difficulty_level: row.question!.difficulty_level,
      activity_type: row.question!.activity_type,
      max_score: row.question!.max_score ?? DEFAULT_QUESTION_MAX_SCORE,
      options: shuffleArray(
        (row.question!.question_to_answer ?? [])
          .map((link) => link.answer)
          .filter((answer): answer is { answer_id: string; option_text: string } => answer !== null),
      ),
    }));

  return { questions, error: null };
}

/** Just position and question id — enough to work out what is still unanswered. */
export async function loadSessionPositions(supabase: SupabaseClient, sessionId: string) {
  const { data, error } = await supabase
    .from('session_to_question')
    .select('position, question_id')
    .eq('session_id', sessionId);

  return { positions: (data ?? []) as SessionPosition[], error };
}

/**
 * All options of one question *with* the solution — is_correct, explanation and option_text.
 *
 * Only for the feedback route, and only after answered_question_log proves the student has
 * already committed an answer. Everything the client sees before that goes through
 * loadSessionQuestions, which deliberately omits these columns.
 */
export async function loadQuestionOptions(supabase: SupabaseClient, questionId: string) {
  const { data, error } = await supabase
    .from('question_to_answer')
    .select('answer:answer_id ( answer_id, option_text, explanation, is_correct )')
    .eq('question_id', questionId);

  if (error) return { options: null, error };

  const options = ((data ?? []) as unknown as { answer: QuestionOption | null }[])
    .map((row) => row.answer)
    .filter((answer): answer is QuestionOption => answer !== null);

  return { options, error: null };
}

// Unlike SESSION_QUESTION_COLUMNS, this discloses is_correct/explanation directly — safe here
// because loadInstructorSessionQuestions is only ever called from an instructor route, gated by
// requireInstructor, inspecting a session that already isn't the caller's own to "solve".
const INSTRUCTOR_SESSION_QUESTION_COLUMNS = `
  position,
  question:question_id (
    question_id,
    question_prompt,
    question_to_answer (
      answer:answer_id ( answer_id, option_text, is_correct, explanation )
    )
  )
`;

type InstructorQuestionRow = {
  position: number;
  question: {
    question_id: string;
    question_prompt: string;
    question_to_answer: { answer: QuestionOption | null }[] | null;
  } | null;
};

export type InstructorQuestionDetail = {
  position: number;
  questionId: string;
  prompt: string;
  options: QuestionOption[];
  selectedAnswerId: string | null;
};

/**
 * GitHub #276: one session's questions, every option's correctness, and which option the
 * student picked — what the combined Instructor Dashboard's expanded quiz-attempt row shows.
 * Nothing else in this file discloses is_correct/explanation before an answer exists (see
 * loadSessionQuestions/loadQuestionOptions's own comments) because a student could otherwise
 * probe for the right answer; an instructor looking at a student's already-submitted attempt
 * has no such use for it, so both are included unconditionally here.
 *
 * Two queries regardless of question count, same reasoning as loadProgressForSessions: a
 * per-question round trip would turn one expand click into N+1 requests.
 */
export async function loadInstructorSessionQuestions(supabase: SupabaseClient, sessionId: string) {
  const [{ data: questionRows, error: questionError }, { data: answerRows, error: answerError }] = await Promise.all([
    supabase
      .from('session_to_question')
      .select(INSTRUCTOR_SESSION_QUESTION_COLUMNS)
      .eq('session_id', sessionId)
      .order('position', { ascending: true }),
    supabase.from('answered_question_log').select('question_id, submitted_option').eq('session_id', sessionId),
  ]);

  const error = questionError ?? answerError;
  if (error) return { questions: null, error };

  const selectedByQuestion = new Map(
    ((answerRows ?? []) as { question_id: string; submitted_option: string }[]).map((row) => [row.question_id, row.submitted_option]),
  );

  const questions: InstructorQuestionDetail[] = ((questionRows ?? []) as unknown as InstructorQuestionRow[])
    .filter((row) => row.question !== null)
    .map((row) => ({
      position: row.position,
      questionId: row.question!.question_id,
      prompt: row.question!.question_prompt,
      options: (row.question!.question_to_answer ?? [])
        .map((link) => link.answer)
        .filter((answer): answer is QuestionOption => answer !== null),
      selectedAnswerId: selectedByQuestion.get(row.question!.question_id) ?? null,
    }));

  return { questions, error: null };
}

/** Answers already submitted, including the feedback they have already earned. */
export async function loadSessionAnswers(supabase: SupabaseClient, sessionId: string) {
  const { data, error } = await supabase
    .from('answered_question_log')
    .select(SESSION_ANSWER_COLUMNS)
    .eq('session_id', sessionId);

  if (error) return { answers: null, error };

  const answers = ((data ?? []) as unknown as AnswerRow[]).map((row) => ({
    question_id: row.question_id,
    submitted_option: row.submitted_option,
    score: row.score,
    submitted_at: row.submitted_at,
    correct: row.answer?.is_correct ?? null,
    explanation: row.answer?.explanation ?? null,
  }));

  return { answers, error: null };
}

/** One finished attempt, as a history list needs it (requirements.md:17, REQ-PL-2.8). */
export type CompletedAttempt = {
  sessionId: string;
  difficultyLevel: number;
  score: number;
  maxScore: number;
  passed: boolean;
  completedAt: string | null;
};

// Only what a history row shows. user_id and activity_type are the filter, not the payload,
// and status is 'completed' for every row here by definition — none of them need shipping.
const COMPLETED_ATTEMPT_COLUMNS = 'session_id, difficulty_level, cumulative_score, max_score, passed, ended_at';

type CompletedAttemptRow = {
  session_id: string;
  difficulty_level: number;
  cumulative_score: number;
  max_score: number;
  passed: boolean;
  ended_at: string | null;
};

/**
 * Every completed attempt of one student at one activity type, newest first.
 *
 * Scoped to a single activity type on purpose: the cross-activity list is already served by
 * GET /api/sessions?status=completed, and two ways to ask the same question drift apart.
 *
 * Sorted by ended_at, with started_at as a tiebreaker. Postgres orders DESC as NULLS FIRST,
 * so a completed row without ended_at would otherwise jump to the top — completeSession always
 * sets it, but the secondary key makes the order stable without relying on that.
 */
export async function loadCompletedAttempts(
  supabase: SupabaseClient,
  userId: string,
  activityType: string,
) {
  const { data, error } = await supabase
    .from('session_log')
    .select(COMPLETED_ATTEMPT_COLUMNS)
    .eq('user_id', userId)
    .eq('activity_type', activityType)
    .eq('status', 'completed')
    .order('ended_at', { ascending: false })
    .order('started_at', { ascending: false });

  if (error) return { attempts: null, error };

  const attempts: CompletedAttempt[] = ((data ?? []) as unknown as CompletedAttemptRow[]).map((row) => ({
    sessionId: row.session_id,
    difficultyLevel: row.difficulty_level,
    score: row.cumulative_score,
    maxScore: row.max_score,
    passed: row.passed,
    completedAt: row.ended_at,
  }));

  return { attempts, error: null };
}

export type SessionProgress = {
  questionCount: number;
  answeredCount: number;
  nextPosition: number | null;
  /** The drawn question ids in presentation order (REQ-DL-3.1). */
  questionIds: string[];
  lastQuestionIndex: number | null;
};

/**
 * A session plus its progress — the server-side name for lib/sessionTypes.ts's SessionListEntry,
 * which is the one declaration of this shape (GitHub #173). It used to be a hand-kept copy so
 * that nothing here imported from the 'use client' lib/sessionClient.ts; sessionTypes.ts imports
 * nothing at all, so both sides can now share it without that risk.
 *
 * Not to be confused with lib/activityLogTypes.ts's ActivityLogEntry, the display shape the
 * profile/dashboard log UI (GitHub #48) actually renders — that one is derived from this one
 * client-side (see toActivityLogEntry in lib/activityLogTypes.ts).
 */
export type ActivityLogRow = SessionListEntry;

/**
 * Every session the student has ever started, across every activity type and status — the full
 * history behind the profile's activity log. Unlike loadCompletedAttempts (one activity type,
 * completed only) or the per-status list behind GET /api/sessions (one status at a time), this
 * merges in-progress, completed and abandoned sessions onto a single timeline.
 *
 * Ordered by whichever timestamp is the "when did this last matter" one for its row — ended_at
 * for a session that is over, started_at for one still running — computed in JS rather than by
 * the query, since a mixed-status list has no single column both kinds can be ordered on.
 */
export async function loadActivityLog(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('session_log')
    .select(SESSION_COLUMNS)
    .eq('user_id', userId);

  if (error) return { activities: null, error };

  type SessionRow = Omit<ActivityLogRow, 'questionCount' | 'answeredCount' | 'nextPosition'>;

  const ordered = ((data ?? []) as SessionRow[]).slice().sort((a, b) => {
    const at = new Date(a.ended_at ?? a.started_at).getTime();
    const bt = new Date(b.ended_at ?? b.started_at).getTime();
    return bt - at;
  });

  const { progress, error: progressError } = await loadProgressForSessions(
    supabase,
    ordered.map((session) => session.session_id),
  );

  if (progressError) return { activities: null, error: progressError };

  const activities: ActivityLogRow[] = ordered.map((session) => {
    const sessionProgress = progress!.get(session.session_id);

    return {
      ...session,
      questionCount: sessionProgress?.questionCount ?? 0,
      answeredCount: sessionProgress?.answeredCount ?? 0,
      nextPosition: sessionProgress?.nextPosition ?? null,
    };
  });

  return { activities, error: null };
}

/**
 * The "user" row joined onto a session, only for deriving a display name and for filtering
 * instructors out. Aliased to `student` in the select because the table is called "user" (a
 * reserved word) and an unaliased embed would sit next to the row's own user_id column.
 *
 * !inner matters: without it, .eq('student.role', 'student') would null the embed rather than
 * drop the row, and an instructor's own sessions would still appear in their report.
 */
const STUDENT_EMBED = 'student:user!inner(first_name, last_name, username, role)';

type EmbeddedStudent = {
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  role: string;
};

/**
 * There is no name column — first/last name are the display name when set, username the
 * fallback for an account that filled in neither.
 */
function studentDisplayName(student: EmbeddedStudent): string {
  const fullName = [student.first_name, student.last_name].filter(Boolean).join(' ').trim();
  return fullName || student.username || 'Unknown student';
}

/**
 * Every student's attempts across the whole class, newest first (GitHub #171) — the real data
 * behind the Instructor Dashboard.
 *
 * The class-wide counterpart to loadActivityLog: same merged timeline of in-progress,
 * completed and abandoned sessions, but without that one's .eq('user_id', …) scope. Nothing in
 * the database restricts this — every data route uses the service-role client, which bypasses
 * the own_sessions_select policy — so the caller MUST run requireInstructor first. Reading
 * another student's rows is exactly what this query is for, and exactly what the guard exists
 * to gate.
 *
 * Ordered in the query rather than in JS the way loadActivityLog does it. started_at is the
 * secondary key for the same reason as in loadCompletedAttempts: Postgres orders DESC as NULLS
 * FIRST, so running sessions (ended_at IS NULL) group at the top and need a stable order among
 * themselves.
 *
 * Carries no question prompts, options, is_correct or explanation — this answers "who did what
 * and how did it go", so SESSION_COLUMNS is the whole payload.
 *
 * Excludes WRITE_ACCEPTANCE_CRITERIA session_log rows: this is the query behind
 * loadInstructorActivities, which app/instructor/page.tsx (GitHub #276) already merges
 * client-side with GET /api/instructor/acceptance-criteria/submissions (one row per graded
 * submission, via toAcSubmissionRow) into the combined dashboard. Now that AC attempts have real
 * session_log rows too, including them here as well would show every AC attempt twice — once
 * (correctly) as a submission row, once (redundantly, and mislabeled as a quiz) as a session row.
 * loadStudentActivityForIds has no such second source to double against — the course CSV export
 * is the only thing that reads it, and there's no separate AC-submissions merge there — so it
 * deliberately keeps including every activity type.
 */
export async function loadAllStudentActivity(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('session_log')
    .select(`${SESSION_COLUMNS}, ${STUDENT_EMBED}`)
    .eq('student.role', 'student')
    .neq('activity_type', 'WRITE_ACCEPTANCE_CRITERIA')
    .order('ended_at', { ascending: false })
    .order('started_at', { ascending: false });

  if (error) return { activities: null, error };

  type SessionRow = Omit<ActivityLogRow, 'questionCount' | 'answeredCount' | 'nextPosition'> & {
    student: EmbeddedStudent;
  };

  const rows = (data ?? []) as unknown as SessionRow[];

  const { progress, error: progressError } = await loadProgressForSessions(
    supabase,
    rows.map((row) => row.session_id),
  );

  if (progressError) return { activities: null, error: progressError };

  // The embed is destructured off rather than spread along: it carries role and username,
  // which are inputs to this query, not part of what the endpoint discloses.
  const activities: InstructorActivityEntry[] = rows.map(({ student, ...session }) => {
    const sessionProgress = progress!.get(session.session_id);

    return {
      ...session,
      questionCount: sessionProgress?.questionCount ?? 0,
      answeredCount: sessionProgress?.answeredCount ?? 0,
      nextPosition: sessionProgress?.nextPosition ?? null,
      studentId: session.user_id,
      studentName: studentDisplayName(student),
    };
  });

  return { activities, error: null };
}

/**
 * Every attempt belonging to a specific set of students, newest first — the sibling
 * loadAllStudentActivity needs for a course roster (app/api/instructor/courses/[id]/route.ts,
 * REQ-DL-5): that function has no id filter at all, only a class-wide role scope, so a course
 * with a handful of enrolled students would otherwise mean fetching every student's activity
 * and filtering client-side. Same SESSION_COLUMNS/STUDENT_EMBED/progress-lookup/studentDisplayName
 * pipeline as loadAllStudentActivity, just scoped by .in('user_id', …) instead of role.
 *
 * studentIds is expected to already be trusted (e.g. drawn from student_course, which only ever
 * gets real students inserted into it) — this does not re-check role. An empty list short-
 * circuits before querying: .in('user_id', []) is not something to rely on Postgrest for, and a
 * course with zero enrolled students has nothing to fetch anyway.
 */
export async function loadStudentActivityForIds(supabase: SupabaseClient, studentIds: string[]) {
  if (studentIds.length === 0) return { activities: [] as InstructorActivityEntry[], error: null };

  const { data, error } = await supabase
    .from('session_log')
    .select(`${SESSION_COLUMNS}, ${STUDENT_EMBED}`)
    .in('user_id', studentIds)
    .order('ended_at', { ascending: false })
    .order('started_at', { ascending: false });

  if (error) return { activities: null, error };

  type SessionRow = Omit<ActivityLogRow, 'questionCount' | 'answeredCount' | 'nextPosition'> & {
    student: EmbeddedStudent;
  };

  const rows = (data ?? []) as unknown as SessionRow[];

  const { progress, error: progressError } = await loadProgressForSessions(
    supabase,
    rows.map((row) => row.session_id),
  );

  if (progressError) return { activities: null, error: progressError };

  const activities: InstructorActivityEntry[] = rows.map(({ student, ...session }) => {
    const sessionProgress = progress!.get(session.session_id);

    return {
      ...session,
      questionCount: sessionProgress?.questionCount ?? 0,
      answeredCount: sessionProgress?.answeredCount ?? 0,
      nextPosition: sessionProgress?.nextPosition ?? null,
      studentId: session.user_id,
      studentName: studentDisplayName(student),
    };
  });

  return { activities, error: null };
}

/**
 * Every session_log record belonging to a student, class-wide (GitHub #115) — the leaner
 * counterpart to loadAllStudentActivity (#171): same STUDENT_EMBED join and role = 'student'
 * scope, but no loadProgressForSessions call, since this endpoint's AC (student, activity,
 * level, start date, score, result) never asks how far into the session the student got.
 *
 * "Students of the current prof" is, today, every account with role 'student' — there is no
 * professor-to-student assignment (class/section) anywhere in the schema, so this is the same
 * scope #171 already uses. A real per-professor scope would need that relationship to exist
 * first.
 *
 * Newest first by started_at — the AC does not specify an order, but every other listing in
 * this codebase defaults to newest-first, and "Start date" is the one date this endpoint has.
 */
export async function loadAllStudentSessions(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('session_log')
    .select(`${SESSION_COLUMNS}, ${STUDENT_EMBED}`)
    .eq('student.role', 'student')
    .order('started_at', { ascending: false });

  if (error) return { sessions: null, error };

  type SessionRow = SessionRecord & { student: EmbeddedStudent };

  // The embed is destructured off rather than spread along: it carries role and username,
  // which are inputs to this query, not part of what the endpoint discloses.
  const sessions: InstructorSessionEntry[] = ((data ?? []) as unknown as SessionRow[]).map(
    ({ student, ...session }) => ({
      ...session,
      studentId: session.user_id,
      studentName: studentDisplayName(student),
    }),
  );

  return { sessions, error: null };
}

/**
 * Progress for several sessions at once, keyed by session id.
 *
 * Four queries regardless of how many sessions are passed in — a per-session lookup would turn
 * a status page into N+1 round trips. `sessionIds` is a mix of Type A (session_to_question /
 * answered_question_log) and Write Acceptance Criteria (session_to_user_story / submission)
 * session ids; a given id only ever has rows on one side, so the two pairs are merged into the
 * same per-session bag below rather than picked apart by activity type. session_to_user_story's
 * `user_story_id` is carried in SessionPosition's `question_id` field and submission's
 * `user_story_id` in the `answered` set's question-id slot — same shape nextUnansweredPosition
 * already accepts, so "which position comes next" needs no AC-specific derivation.
 */
export async function loadProgressForSessions(supabase: SupabaseClient, sessionIds: string[]) {
  if (sessionIds.length === 0) {
    return { progress: new Map<string, SessionProgress>(), error: null };
  }

  const [
    { data: positionRows, error: positionError },
    { data: answerRows, error: answerError },
    { data: storyRows, error: storyError },
    { data: submissionRows, error: submissionError },
  ] = await Promise.all([
    supabase
      .from('session_to_question')
      .select('session_id, position, question_id')
      .in('session_id', sessionIds),
    supabase
      .from('answered_question_log')
      .select('session_id, question_id')
      .in('session_id', sessionIds),
    supabase
      .from('session_to_user_story')
      .select('session_id, position, user_story_id')
      .in('session_id', sessionIds),
    supabase
      .from('submission')
      .select('session_id, user_story_id')
      .in('session_id', sessionIds),
  ]);

  const error = positionError ?? answerError ?? storyError ?? submissionError ?? null;
  if (error) return { progress: null, error };

  const grouped = new Map(
    sessionIds.map((id) => [id, { positions: [] as SessionPosition[], answered: new Set<string>() }]),
  );

  for (const row of (positionRows ?? []) as (SessionPosition & { session_id: string })[]) {
    grouped.get(row.session_id)?.positions.push({ position: row.position, question_id: row.question_id });
  }

  for (const row of (storyRows ?? []) as { session_id: string; position: number; user_story_id: string }[]) {
    grouped.get(row.session_id)?.positions.push({ position: row.position, question_id: row.user_story_id });
  }

  for (const row of (answerRows ?? []) as { session_id: string; question_id: string }[]) {
    grouped.get(row.session_id)?.answered.add(row.question_id);
  }

  for (const row of (submissionRows ?? []) as { session_id: string; user_story_id: string }[]) {
    grouped.get(row.session_id)?.answered.add(row.user_story_id);
  }

  const progress = new Map<string, SessionProgress>();

  for (const [sessionId, { positions, answered }] of grouped) {
    const ordered = [...positions].sort((a, b) => a.position - b.position);

    progress.set(sessionId, {
      questionCount: positions.length,
      answeredCount: answered.size,
      nextPosition: nextUnansweredPosition(positions, answered),
      questionIds: ordered.map((row) => row.question_id),
      lastQuestionIndex: lastAnsweredPosition(positions, answered),
    });
  }

  return { progress, error: null };
}

/**
 * The lowest position without a submitted answer, or null when everything is answered.
 *
 * Derived, never stored. A current_question_index column would be the only place in the
 * schema with real merge conflicts between two devices; a derived value cannot disagree
 * with itself.
 */
export function nextUnansweredPosition(
  positions: SessionPosition[],
  answeredQuestionIds: Set<string>,
): number | null {
  return positions
    .filter((row) => !answeredQuestionIds.has(row.question_id))
    .sort((a, b) => a.position - b.position)[0]?.position ?? null;
}

/**
 * The highest position that already has an answer, or null when nothing is answered yet —
 * REQ-DL-3.1's "index of the last question answered".
 *
 * Derived for the same reason as nextUnansweredPosition: a stored index is the one value two
 * devices could disagree about. Highest rather than most recent, because answers can only be
 * submitted for the next unanswered position, so the two coincide.
 */
export function lastAnsweredPosition(
  positions: SessionPosition[],
  answeredQuestionIds: Set<string>,
): number | null {
  const answered = positions
    .filter((row) => answeredQuestionIds.has(row.question_id))
    .sort((a, b) => b.position - a.position);

  return answered[0]?.position ?? null;
}
