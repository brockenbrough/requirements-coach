'use client';

// Single place where the UI talks to the API routes behind a student's practice — sessions
// and the progress derived from them — in the same spirit as lib/authClient.ts for the auth
// routes: no page hand-rolls the Authorization header or picks apart an error body.
//
// The shapes below mirror what the routes actually return — notably, a question
// carries its options *without* is_correct or explanation. Those only ever arrive
// from the feedback route, and only after the answer has been committed.

import type { ActivityType } from './activityTypes';
import { toActivityLogEntry, type StudentAttemptDetail } from './activityLogTypes';
import { toInstant } from './dateTime';
import type { AvailableActivityTitles, PublicStudentProfile, PublicStudentTitle } from './leaderboardTypes';
import type { ActivityCourseRef, InstructorActivityEntry, SessionListEntry, SessionRecord } from './sessionTypes';
import type { OwnedActivityTypeSummary } from './activityTypeQueries';
import type { QuizQuestion } from './quizQuestionTypes';
import { getCachedCompletedAttempts, setCachedCompletedAttempts } from './completedAttemptsStore';
import { getCachedActivityLog, setCachedActivityLog } from './activityLogStore';
import { getCachedCompletedSessions, setCachedCompletedSessions } from './completedSessionsStore';
import { getCachedScore, setCachedScore } from './scoreStore';
import { getCachedInstructorStudents, setCachedInstructorStudents, type InstructorStudentsScope } from './instructorStudentsStore';
import { getCachedInstructorActivities, setCachedInstructorActivities } from './instructorActivityStore';
import {
  getCachedAcceptanceCriteriaSubmissions,
  setCachedAcceptanceCriteriaSubmissions,
} from './acceptanceCriteriaSubmissionsStore';

// The row shapes themselves live in lib/sessionTypes.ts, which imports nothing, so the routes
// can share them without importing this 'use client' module. Re-exported here so this file
// stays the one import the UI needs for anything session-related.
export type { InstructorActivityEntry, SessionListEntry, SessionRecord } from './sessionTypes';
export type { OwnedActivityTypeSummary } from './activityTypeQueries';

export type SessionQuestionOption = {
  answer_id: string;
  option_text: string;
};

export type SessionQuestion = {
  position: number;
  question_id: string;
  question_prompt: string;
  difficulty_level: number;
  activity_type: string;
  max_score: number;
  options: SessionQuestionOption[];
};

export type SessionAnswer = {
  question_id: string;
  submitted_option: string;
  score: number;
  submitted_at: string;
  correct: boolean | null;
  explanation: string | null;
};

export type StartSessionResult = {
  session: SessionRecord;
  questions: SessionQuestion[];
  resumed: boolean;
};

export type CurrentSessionResult = {
  session: SessionRecord | null;
  questions: SessionQuestion[];
  answers: SessionAnswer[];
  answeredCount?: number;
  nextPosition: number | null;
  completed?: boolean;
};

/** The answered_question_log row created by a submission (REQ-DL-4.1). */
export type SubmittedAnswerRecord = {
  logId: string;
  sessionId: string;
  questionId: string;
  /** The submitted_option that was recorded — named after the request field that carried it. */
  selectedOptionId: string;
  score: number;
  /** Set by the database, so null only in the pathological case where the write did not echo it back. */
  submittedAt: string | null;
};

export type SubmitAnswerResult = {
  answer: SubmittedAnswerRecord;
  correct: boolean;
  explanation: string | null;
  score: number;
  session: SessionRecord;
  answeredCount: number;
  nextPosition: number | null;
  completed: boolean;
};

/** One finished attempt, as GET /api/sessions/completed returns it. */
export type CompletedAttempt = {
  sessionId: string;
  difficultyLevel: number;
  score: number;
  maxScore: number;
  passed: boolean;
  /** Nullable because session_log.ended_at is. */
  completedAt: string | null;
};

export type FeedbackOption = {
  answerId: string;
  optionText: string;
  explanation: string | null;
};

export type FeedbackResult = {
  questionId: string;
  correct: boolean;
  score: number;
  submittedAt: string;
  selectedOption: FeedbackOption;
  /** Null when the pick was correct — its own explanation is then the correct one. */
  correctOption: FeedbackOption | null;
};

/**
 * Discriminated instead of thrown, like AuthResult in lib/authClient.ts: callers have
 * to branch on status anyway (409 = no profile yet / already answered, 400 = question
 * bank too small), and an exception would make that read worse.
 */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const NETWORK_ERROR = 'Could not reach the server. Please try again.';

async function request<T>(url: string, init: RequestInit, token: string): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
  } catch {
    // status 0 marks "never reached the server", so callers can tell it apart from a 500.
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return { ok: false, status: response.status, error: body?.error || 'Something went wrong.' };
  }

  return { ok: true, data: body as T };
}

function postJson(payload: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

function patchJson(payload: unknown): RequestInit {
  return {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

/**
 * Starts an activity — or picks up the one already running.
 *
 * There is deliberately no separate "resume" call: uq_session_log_one_active allows a
 * student one in-progress session per activity type, so the route answers 201 for a fresh
 * draw and 200 with resumed: true for the existing one. Both are success.
 *
 * options.difficultyLevel is the replay override: omitted, the server picks the next unpassed
 * level (Story 2's auto-advance); passed, the server starts at that level instead — but only if
 * the student has already passed it (403 otherwise). Conditionally spread rather than always
 * sent, so an omitted level can't be confused with an explicit one server-side.
 */
export function startSession(
  token: string,
  activityType: ActivityType,
  options: { difficultyLevel?: number; assembledQuizId?: string } = {},
) {
  return request<StartSessionResult>(
    '/api/sessions',
    postJson({
      activityType,
      ...(options.difficultyLevel !== undefined ? { difficultyLevel: options.difficultyLevel } : {}),
      ...(options.assembledQuizId !== undefined ? { assembledQuizId: options.assembledQuizId } : {}),
    }),
    token,
  );
}

/**
 * Gives up a running session (REQ-PL-6.3's "Abandon"). The only way out of in-progress other
 * than answering every question — after this, POST /api/sessions draws a fresh set for the
 * same activity type instead of handing back the abandoned one.
 */
export function abandonSession(token: string, sessionId: string) {
  return request<{ session: SessionRecord }>(`/api/sessions/${sessionId}/abandon`, postJson({}), token);
}

/**
 * The running session with its questions and the answers given so far.
 * session: null (with a 200) means nothing is in progress — not an error.
 */
export function loadCurrentSession(token: string, activityType: ActivityType, assembledQuizId?: string) {
  const query = assembledQuizId
    ? `activityType=${encodeURIComponent(activityType)}&assembledQuizId=${encodeURIComponent(assembledQuizId)}`
    : `activityType=${encodeURIComponent(activityType)}`;
  return request<CurrentSessionResult>(`/api/sessions/current?${query}`, { method: 'GET' }, token);
}

/**
 * The student's sessions in one status, across every activity type, newest started first.
 *
 * The cross-activity counterpart to loadCompletedAttempts: this one answers "what did I do
 * lately", that one "how did I do at this activity". Neither carries questions or answers.
 *
 * The 'completed' list is cached in localStorage (lib/completedSessionsStore.ts) keyed by
 * studentId, since it's the one status the dashboard actually asks for on every mount.
 * Pass studentId to opt into that cache; without it (or for 'in-progress'/'abandoned') this
 * always hits the network, unchanged. forceRefresh bypasses the cache and re-caches the
 * server's answer — the play flow does this once a session completes.
 */
export function loadSessions(
  token: string,
  status: 'in-progress' | 'completed' | 'abandoned',
  options: { studentId?: string; forceRefresh?: boolean } = {},
) {
  const { studentId, forceRefresh } = options;

  if (status === 'completed' && studentId && !forceRefresh) {
    const cached = getCachedCompletedSessions(studentId);
    if (cached !== null) {
      return Promise.resolve<ApiResult<{ sessions: SessionListEntry[] }>>({
        ok: true,
        data: { sessions: cached },
      });
    }
  }

  return request<{ sessions: SessionListEntry[] }>(
    `/api/sessions?status=${status}`,
    { method: 'GET' },
    token,
  ).then((result) => {
    if (result.ok && status === 'completed' && studentId) {
      setCachedCompletedSessions(studentId, result.data.sessions);
    }
    return result;
  });
}

function fetchCompletedAttempts(token: string, studentId: string, activityType: ActivityType, assembledQuizId?: string) {
  const query = assembledQuizId
    ? `activityType=${encodeURIComponent(activityType)}&assembledQuizId=${encodeURIComponent(assembledQuizId)}`
    : `activityType=${encodeURIComponent(activityType)}`;

  return request<{ attempts: CompletedAttempt[] }>(`/api/sessions/completed?${query}`, { method: 'GET' }, token).then((result) => {
    if (!result.ok) return result;

    // completedAt comes from session_log.ended_at, which carries no zone — pinned to UTC before
    // it is cached, so a cache hit and a fresh fetch can't disagree about what the value means.
    const attempts = result.data.attempts.map((attempt) => ({
      ...attempt,
      completedAt: attempt.completedAt === null ? null : toInstant(attempt.completedAt),
    }));

    setCachedCompletedAttempts(studentId, activityType, attempts, assembledQuizId);
    return { ok: true as const, data: { attempts } };
  });
}

/**
 * The student's finished attempts at one activity, newest first. An empty list is a normal
 * 200 — a student who has not completed anything yet simply has no history.
 *
 * Cached in localStorage (lib/completedAttemptsStore.ts) keyed by studentId *and* activityType,
 * the same pattern as loadStudentScore/loadSessions('completed', ...), since the activity detail
 * page otherwise refetches this on every mount. A plain call resolves from the cache immediately
 * when present, but — unlike the other cache-first loaders — still fires the network request in
 * parallel underneath: a session finished on another device is otherwise invisible here forever,
 * since nothing on *this* device would ever have a reason to invalidate the cache (GitHub #333).
 * That background result only reaches the caller via onRevalidate, and only when it actually
 * differs from what was just returned — a same-device reload re-fetching identical rows should
 * not cause the table to re-render. Pass forceRefresh to skip the cache and await the network
 * result directly instead — the play flow does this once a session for that activity completes.
 */
export function loadCompletedAttempts(
  token: string,
  studentId: string,
  activityType: ActivityType,
  options: { forceRefresh?: boolean; onRevalidate?: (attempts: CompletedAttempt[]) => void; assembledQuizId?: string } = {},
) {
  if (!options.forceRefresh) {
    const cached = getCachedCompletedAttempts(studentId, activityType, options.assembledQuizId);
    if (cached !== null) {
      if (options.onRevalidate) {
        const onRevalidate = options.onRevalidate;
        fetchCompletedAttempts(token, studentId, activityType, options.assembledQuizId).then((result) => {
          if (result.ok && JSON.stringify(result.data.attempts) !== JSON.stringify(cached)) {
            onRevalidate(result.data.attempts);
          }
        });
      }
      return Promise.resolve<ApiResult<{ attempts: CompletedAttempt[] }>>({ ok: true, data: { attempts: cached } });
    }
  }

  return fetchCompletedAttempts(token, studentId, activityType, options.assembledQuizId);
}

function fetchStudentScore(token: string, studentId: string) {
  return request<{ score: number; sessionsCompleted: number }>(
    `/api/students/${encodeURIComponent(studentId)}/score`,
    { method: 'GET' },
    token,
  ).then((result) => {
    if (result.ok) {
      setCachedScore(studentId, result.data);
    }
    return result;
  });
}

/**
 * The student's cumulative score: the sum of their best score at each completed difficulty
 * level of each activity type (REQ-GAM-DL-1 — completed, not passed; see computeStudentScore's
 * own comment). Cached in localStorage (lib/scoreStore.ts) keyed by studentId, since it
 * otherwise gets refetched on every AppShell mount i.e. every navigation. A plain call is
 * served from the cache when present; pass forceRefresh to bypass it and re-cache the server's
 * answer — the play flow does this once a session completes, since that's the only thing that
 * actually changes the score *on this device*.
 *
 * onRevalidate mirrors loadCompletedAttempts's own (GitHub #333): a cache hit still resolves
 * immediately, but a real request fires in parallel underneath, and onRevalidate only fires if
 * the server's answer actually differs from the cached one. Without this, a stale localStorage
 * entry — left behind by, say, a session completed in a different tab/device, or a score that
 * went stale before a client-side bug was fixed — would never self-correct on this device short
 * of finishing another session or logging out; a private/incognito window (no localStorage to
 * hit) would show the right number while a normal tab kept showing the wrong one indefinitely.
 *
 * sessionsCompleted (GitHub #39) rides along with score in both the network response and the
 * cache — the profile page's completed-sessions summary reads it off the same call rather than
 * a second request.
 *
 * studentId has to be the authenticated student; the route answers 403 for anyone else.
 */
export function loadStudentScore(
  token: string,
  studentId: string,
  options: { forceRefresh?: boolean; onRevalidate?: (score: { score: number; sessionsCompleted: number }) => void } = {},
) {
  if (!options.forceRefresh) {
    const cached = getCachedScore(studentId);
    if (cached !== null) {
      if (options.onRevalidate) {
        const onRevalidate = options.onRevalidate;
        fetchStudentScore(token, studentId).then((result) => {
          if (result.ok && JSON.stringify(result.data) !== JSON.stringify(cached)) {
            onRevalidate(result.data);
          }
        });
      }
      return Promise.resolve<ApiResult<{ score: number; sessionsCompleted: number }>>({ ok: true, data: cached });
    }
  }

  return fetchStudentScore(token, studentId);
}

/**
 * The student's full activity log — every session across every activity type and status
 * (GET /api/students/{id}/activities), newest-relevant-timestamp first. Cached in localStorage
 * (lib/activityLogStore.ts) keyed by studentId for the same reason as loadStudentScore.
 *
 * Unlike the score and completed-sessions caches, this list includes in-progress and abandoned
 * sessions, whose progress changes as soon as the student answers a question or starts/abandons
 * an activity elsewhere — callers must forceRefresh at those points too, not only once a session
 * completes.
 *
 * studentId has to be the authenticated student; the route answers 403 for anyone else.
 */
export function loadActivityLog(
  token: string,
  studentId: string,
  options: { forceRefresh?: boolean } = {},
) {
  if (!options.forceRefresh) {
    const cached = getCachedActivityLog(studentId);
    if (cached !== null) {
      return Promise.resolve<ApiResult<{ activities: SessionListEntry[] }>>({
        ok: true,
        data: { activities: cached },
      });
    }
  }

  return request<{ activities: SessionListEntry[] }>(
    `/api/students/${encodeURIComponent(studentId)}/activities`,
    { method: 'GET' },
    token,
  ).then((result) => {
    if (result.ok) {
      setCachedActivityLog(studentId, result.data.activities);
    }
    return result;
  });
}

/**
 * Every student's attempts across the class (GET /api/instructor/activities, GitHub #171) —
 * what the Instructor Dashboard renders. The route answers 403 for anyone who isn't a
 * confirmed instructor.
 *
 * Cache-first: returns the stored list on a hit, calls the network only on a miss or when
 * forceRefresh is true (GitHub #176). Keyed by instructorId so the cache is not shared
 * between different instructor accounts on the same device. Students write the data, so
 * staleness is bounded by mount and the explicit Refresh control on the dashboard.
 */
export function loadInstructorActivities(
  token: string,
  instructorId: string,
  options: { forceRefresh?: boolean } = {},
) {
  if (!options.forceRefresh) {
    const cached = getCachedInstructorActivities(instructorId);
    if (cached !== null) {
      return Promise.resolve<ApiResult<{ sessions: InstructorActivityEntry[]; ownedActivityTypes: OwnedActivityTypeSummary[] }>>({
        ok: true,
        data: cached,
      });
    }
  }

  return request<{ sessions: InstructorActivityEntry[]; ownedActivityTypes: OwnedActivityTypeSummary[] }>(
    '/api/instructor/activities',
    { method: 'GET' },
    token,
  ).then((result) => {
    if (result.ok) {
      setCachedInstructorActivities(instructorId, result.data);
    }
    return result;
  });
}

export type InstructorQuestionOption = {
  answerId: string;
  optionText: string;
  isCorrect: boolean;
  explanation: string | null;
};

export type InstructorQuestionDetail = {
  position: number;
  questionId: string;
  prompt: string;
  options: InstructorQuestionOption[];
  selectedAnswerId: string | null;
};

/** The wire shape of GET /api/instructor/sessions/:sessionId/answers, before camelCasing options. */
type RawInstructorQuestionDetail = {
  position: number;
  questionId: string;
  prompt: string;
  options: { answer_id: string; option_text: string; is_correct: boolean; explanation: string | null }[];
  selectedAnswerId: string | null;
};

/**
 * GET /api/instructor/sessions/:sessionId/answers (GitHub #276) — one quiz session's questions,
 * every option's correctness, and which one the student picked. Not cached: only fetched when a
 * quiz-attempt row on the combined Instructor Dashboard is expanded, so there is one request per
 * row actually opened rather than one per row in the list.
 */
export function loadInstructorSessionAnswers(token: string, sessionId: string) {
  return request<{ questions: RawInstructorQuestionDetail[] }>(
    `/api/instructor/sessions/${encodeURIComponent(sessionId)}/answers`,
    { method: 'GET' },
    token,
  ).then((result) => {
    if (!result.ok) return result;

    const questions: InstructorQuestionDetail[] = result.data.questions.map((question) => ({
      position: question.position,
      questionId: question.questionId,
      prompt: question.prompt,
      selectedAnswerId: question.selectedAnswerId,
      options: question.options.map((option) => ({
        answerId: option.answer_id,
        optionText: option.option_text,
        isCorrect: option.is_correct,
        explanation: option.explanation,
      })),
    }));

    return { ok: true as const, data: { questions } };
  });
}

/** What POST/PATCH /api/instructor/questions echo back — ids only, not a full QuizQuestion. */
export type SaveQuestionResult = { questionId: string; answerIds: string[] };

/**
 * Translates a QuizQuestion (UI shape) into the request body POST/PATCH expect (DB-facing field
 * names). The question-level `explanation` only has anywhere to go on the correct answer — the
 * database stores explanation per answer option, but QuizQuestion carries just one string, so
 * that's the only round trip this shape can support.
 *
 * includeIds is false for create: the modal's placeholder ids (`q-${Date.now()}`, etc.) aren't
 * real answer ids, and POST doesn't accept or use them — only PATCH needs an id per option, to
 * know which existing answer row each entry updates.
 */
function answersPayload(question: QuizQuestion, includeIds: boolean) {
  return question.answerOptions.map((option) => ({
    ...(includeIds ? { id: option.id } : {}),
    optionText: option.text,
    isCorrect: option.isCorrect,
    ...(option.isCorrect ? { explanation: question.explanation } : {}),
  }));
}

/** Adds a new question to the bank (POST /api/instructor/questions, GitHub #121). */
export function createQuestion(token: string, question: QuizQuestion) {
  return request<SaveQuestionResult>(
    '/api/instructor/questions',
    postJson({
      questionPrompt: question.questionText,
      activityType: question.quizType,
      difficultyLevel: question.level,
      answers: answersPayload(question, false),
    }),
    token,
  );
}

/** Edits an existing question in place (PATCH /api/instructor/questions/{id}, GitHub #158). */
export function updateQuestion(token: string, question: QuizQuestion) {
  return request<SaveQuestionResult>(
    `/api/instructor/questions/${encodeURIComponent(question.id)}`,
    patchJson({
      questionPrompt: question.questionText,
      activityType: question.quizType,
      difficultyLevel: question.level,
      answers: answersPayload(question, true),
    }),
    token,
  );
}

/** The 409 body's `impact` field when a question has already been used in a student session. */
export type QuestionDeleteImpact = {
  sessionsCount: number;
  answeredSessionsCount: number;
  studentsAffectedCount: number;
  pointsAlreadyEarned: number;
};

export type DeleteQuestionResult =
  | { ok: true; data: { questionId: string; pointsPreserved: number } }
  | { ok: false; status: number; error: string; impact?: QuestionDeleteImpact };

/**
 * Removes a question and its answers (DELETE /api/instructor/questions/{id}, GitHub #359). A
 * question already served to a student 409s with an `impact` payload (sessions/students/points
 * affected) rather than a bare message, unless `force` is passed — then the route deletes it
 * anyway, but never reduces the points already earned on any affected session (only max_score may
 * still shrink, and never below what's already been earned). A bespoke fetch rather than the
 * generic `request` helper above, since `impact` on the failure body is specific to this one route.
 */
export async function deleteQuestion(token: string, questionId: string, force = false): Promise<DeleteQuestionResult> {
  const url = `/api/instructor/questions/${encodeURIComponent(questionId)}${force ? '?force=true' : ''}`;

  let response: Response;
  try {
    response = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return { ok: false, status: response.status, error: body?.error || 'Something went wrong.', impact: body?.impact };
  }

  return { ok: true, data: body as { questionId: string; pointsPreserved: number } };
}

/** One student row as returned by GET /api/instructor/students. */
export type StudentSummary = {
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
};

/**
 * Students enrolled in a course this instructor created (GET /api/instructor/students, GitHub
 * #146 follow-up).
 *
 * Default scope ('owned', the route's own default): only students enrolled in one of the
 * instructor's own courses. scope: 'all' opts into the route's ?scope=all — the unscoped, every-
 * student list — which is what components/AddStudentModal.tsx's enrollment search needs, since it
 * must be able to find a student who isn't in any of the instructor's courses yet.
 *
 * Cache-first: returns the stored list on a hit, calls the network only on a miss or when
 * forceRefresh is true — same pattern as loadActivityLog. Keyed by instructorId *and* scope (see
 * lib/instructorStudentsStore.ts) so the two shapes never overwrite each other's cache entry.
 */
export function loadInstructorStudents(
  token: string,
  instructorId: string,
  options: { forceRefresh?: boolean; scope?: InstructorStudentsScope } = {},
) {
  const scope = options.scope ?? 'owned';

  if (!options.forceRefresh) {
    const cached = getCachedInstructorStudents(instructorId, scope);
    if (cached !== null) {
      return Promise.resolve<ApiResult<{ students: StudentSummary[] }>>({
        ok: true,
        data: { students: cached },
      });
    }
  }

  return request<{ students: StudentSummary[] }>(
    scope === 'all' ? '/api/instructor/students?scope=all' : '/api/instructor/students',
    { method: 'GET' },
    token,
  ).then((result) => {
    if (result.ok) {
      setCachedInstructorStudents(instructorId, scope, result.data.students);
    }
    return result;
  });
}

/** One mastery title entry as returned by GET /api/students/{id}/titles. */
export type StudentTitle = {
  activityType: string;
  difficultyLevel: number | null;
  title: string | null;
};

/**
 * The student's current mastery title per activity type
 * (GET /api/students/{studentId}/titles, REQ-GAM-BL-1).
 *
 * Not cached: titles change whenever a session completes with passed=true, and the dashboard
 * that shows them re-mounts on every visit — hitting the network once per page load is cheap
 * enough that a cache would just risk showing a stale title after a student passes a new level.
 */
export function loadStudentTitles(token: string, studentId: string) {
  return request<{ titles: StudentTitle[] }>(
    `/api/students/${encodeURIComponent(studentId)}/titles`,
    { method: 'GET' },
    token,
  );
}

/**
 * Every title the student could ever earn (GET /api/students/{id}/available-titles) — one entry
 * per activity type linked to a course they're enrolled in, each with its full title_definition
 * ladder. Not cached, same reasoning as loadStudentTitles: it changes whenever course enrollment
 * or an instructor's catalog changes, and the pages that use it (dashboard, profile) already
 * re-fetch on every mount.
 */
export function loadAvailableTitles(token: string, studentId: string) {
  return request<{ activities: AvailableActivityTitles[] }>(
    `/api/students/${encodeURIComponent(studentId)}/available-titles`,
    { method: 'GET' },
    token,
  );
}

/** The wire shape of GET /api/students/{id}/public-profile — no studentId; the caller knows it. */
type PublicProfileResponse = {
  username: string;
  avatarUrl: string | null;
  biography: string;
  selectedTitle: string | null;
  score: number;
  titles: PublicStudentTitle[];
  availableTitles: AvailableActivityTitles[];
};

/**
 * A classmate's public profile (GET /api/students/{id}/public-profile, US-5) — username, avatar,
 * biography, cumulative score and mastery titles, and nothing else (see the route's own privacy
 * contract). 403s unless the caller shares a course with studentId; 404 for an unknown id.
 *
 * studentId is re-attached here to match PublicStudentProfile (lib/leaderboardTypes.ts), since
 * the response itself doesn't carry it — the caller already knows which id it asked for.
 *
 * Not cached, the same reasoning as loadStudentTitles: score and titles change whenever the
 * viewed student completes a session, and this page is a rare, one-off visit rather than
 * something re-mounted on every navigation the way the sidebar score is.
 */
export function loadPublicStudentProfile(token: string, studentId: string) {
  return request<PublicProfileResponse>(
    `/api/students/${encodeURIComponent(studentId)}/public-profile`,
    { method: 'GET' },
    token,
  ).then((result) => {
    if (!result.ok) return result;

    const profile: PublicStudentProfile = { studentId, ...result.data };
    return { ok: true as const, data: profile };
  });
}

/** One acceptance-criteria submission row as returned by the submissions API. */
export type SubmissionEntry = {
  submissionId: string;
  userStoryId: string;
  storyText: string;
  submittedText: string;
  llmScore: number | null;
  llmFeedback: string | null;
  submittedAt: string;
  gradedAt: string | null;
};

/**
 * A student's acceptance-criteria submission history
 * (GET /api/instructor/students/{studentId}/acceptance-criteria/submissions, GitHub #153).
 *
 * Cache-first: returns the stored list on a hit, calls the network only on a miss or when
 * forceRefresh is true — same pattern as loadActivityLog. The cache is keyed by studentId so
 * switching between students in the Review page is a hit after the first visit.
 */
export function loadAcceptanceCriteriaSubmissions(
  token: string,
  studentId: string,
  options: { forceRefresh?: boolean } = {},
) {
  if (!options.forceRefresh) {
    const cached = getCachedAcceptanceCriteriaSubmissions(studentId);
    if (cached !== null) {
      return Promise.resolve<ApiResult<{ submissions: SubmissionEntry[] }>>({
        ok: true,
        data: { submissions: cached },
      });
    }
  }

  return request<{ submissions: SubmissionEntry[] }>(
    `/api/instructor/students/${encodeURIComponent(studentId)}/acceptance-criteria/submissions`,
    { method: 'GET' },
    token,
  ).then((result) => {
    if (result.ok) {
      setCachedAcceptanceCriteriaSubmissions(studentId, result.data.submissions);
    }
    return result;
  });
}

/** One attempt as GET /api/instructor/students/{studentId}/detail sends it over the wire. */
type StudentDetailAttemptWire = SessionListEntry & {
  questionResults: boolean[];
  courses: ActivityCourseRef[];
};

type StudentDetailResponse = {
  studentName: string;
  activityNames: Record<string, string>;
  attempts: StudentDetailAttemptWire[];
  classAveragePercent: number | null;
};

export type StudentDetail = {
  studentName: string;
  classAveragePercent: number | null;
  attempts: StudentAttemptDetail[];
};

/**
 * One student's real attempt history, scoped to whatever courses the calling instructor shares
 * with them (GET /api/instructor/students/{studentId}/detail) — the data behind
 * app/instructor/students/[id]/page.tsx, replacing the old fixed lib/mockStudentAttempts.ts
 * fixture. 403 (no body) means the student exists but shares no course with this instructor; 404
 * means the id isn't a student at all — both collapse to `!result.ok` here, same as
 * loadPublicStudentProfile's peer-profile check, so the page doesn't need to tell them apart.
 *
 * Not cached, same reasoning as loadPublicStudentProfile: a rare, one-off page visit rather than
 * something remounted on every navigation the way the sidebar score is.
 */
export function loadStudentDetail(token: string, studentId: string) {
  return request<StudentDetailResponse>(
    `/api/instructor/students/${encodeURIComponent(studentId)}/detail`,
    { method: 'GET' },
    token,
  ).then((result) => {
    if (!result.ok) return result;

    const nameByType = new Map(Object.entries(result.data.activityNames));
    const attempts: StudentAttemptDetail[] = result.data.attempts.map((attempt) => ({
      ...toActivityLogEntry(attempt, nameByType),
      questionResults: attempt.questionResults,
      courses: attempt.courses,
    }));

    return {
      ok: true as const,
      data: { studentName: result.data.studentName, classAveragePercent: result.data.classAveragePercent, attempts },
    };
  });
}

/**
 * Commits one answer. The score is decided by the server from the answer bank — it is
 * neither sent nor trusted from here.
 */
export function submitAnswer(
  token: string,
  sessionId: string,
  questionId: string,
  selectedOptionId: string,
) {
  return request<SubmitAnswerResult>(
    `/api/sessions/${sessionId}/answers`,
    postJson({ questionId, selectedOptionId }),
    token,
  );
}

/**
 * The explanations for an answer that has already been committed. Calling this before
 * submitAnswer returns 404 by design — otherwise it would be a way to test every option.
 */
export function loadFeedback(
  token: string,
  sessionId: string,
  questionId: string,
  selectedOptionId: string,
) {
  return request<FeedbackResult>(
    `/api/sessions/${sessionId}/feedback`,
    postJson({ questionId, selectedOptionId }),
    token,
  );
}
