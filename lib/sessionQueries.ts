// Queries shared by the session routes, so "which question comes next" and "what may the
// client see" are answered in exactly one place.

import { getSupabaseClient } from './supabase';
import { DEFAULT_QUESTION_MAX_SCORE, SESSION_COLUMNS } from './sessionRules';
import type { InstructorActivityEntry, SessionListEntry } from './sessionTypes';
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
 */
export async function loadAllStudentActivity(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('session_log')
    .select(`${SESSION_COLUMNS}, ${STUDENT_EMBED}`)
    .eq('student.role', 'student')
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
 * Progress for several sessions at once, keyed by session id.
 *
 * Two queries regardless of how many sessions are passed in — a per-session lookup would turn
 * a status page into N+1 round trips.
 */
export async function loadProgressForSessions(supabase: SupabaseClient, sessionIds: string[]) {
  if (sessionIds.length === 0) {
    return { progress: new Map<string, SessionProgress>(), error: null };
  }

  const [{ data: positionRows, error: positionError }, { data: answerRows, error: answerError }] =
    await Promise.all([
      supabase
        .from('session_to_question')
        .select('session_id, position, question_id')
        .in('session_id', sessionIds),
      supabase
        .from('answered_question_log')
        .select('session_id, question_id')
        .in('session_id', sessionIds),
    ]);

  const error = positionError ?? answerError ?? null;
  if (error) return { progress: null, error };

  const grouped = new Map(
    sessionIds.map((id) => [id, { positions: [] as SessionPosition[], answered: new Set<string>() }]),
  );

  for (const row of (positionRows ?? []) as (SessionPosition & { session_id: string })[]) {
    grouped.get(row.session_id)?.positions.push({ position: row.position, question_id: row.question_id });
  }

  for (const row of (answerRows ?? []) as { session_id: string; question_id: string }[]) {
    grouped.get(row.session_id)?.answered.add(row.question_id);
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
