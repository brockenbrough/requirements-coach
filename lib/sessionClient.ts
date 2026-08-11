'use client';

// Single place where the UI talks to the API routes behind a student's practice — sessions
// and the progress derived from them — in the same spirit as lib/authClient.ts for the auth
// routes: no page hand-rolls the Authorization header or picks apart an error body.
//
// The shapes below mirror what the routes actually return — notably, a question
// carries its options *without* is_correct or explanation. Those only ever arrive
// from the feedback route, and only after the answer has been committed.

import type { ActivityType } from './activityTypes';
import { toInstant } from './dateTime';
import type { InstructorActivityEntry, SessionListEntry, SessionRecord } from './sessionTypes';
import type { QuizQuestion } from './quizQuestionTypes';
import { getCachedCompletedAttempts, setCachedCompletedAttempts } from './completedAttemptsStore';
import { getCachedActivityLog, setCachedActivityLog } from './activityLogStore';
import { getCachedCompletedSessions, setCachedCompletedSessions } from './completedSessionsStore';
import { getCachedScore, setCachedScore } from './scoreStore';
import { getCachedInstructorStudents, setCachedInstructorStudents } from './instructorStudentsStore';
import { getCachedInstructorQuestions, setCachedInstructorQuestions } from './instructorQuestionsStore';
import {
  getCachedAcceptanceCriteriaSubmissions,
  setCachedAcceptanceCriteriaSubmissions,
} from './acceptanceCriteriaSubmissionsStore';

// The row shapes themselves live in lib/sessionTypes.ts, which imports nothing, so the routes
// can share them without importing this 'use client' module. Re-exported here so this file
// stays the one import the UI needs for anything session-related.
export type { InstructorActivityEntry, SessionListEntry, SessionRecord } from './sessionTypes';

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
 */
export function startSession(token: string, activityType: ActivityType) {
  return request<StartSessionResult>('/api/sessions', postJson({ activityType }), token);
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
export function loadCurrentSession(token: string, activityType: ActivityType) {
  return request<CurrentSessionResult>(
    `/api/sessions/current?activityType=${encodeURIComponent(activityType)}`,
    { method: 'GET' },
    token,
  );
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

/**
 * The student's finished attempts at one activity, newest first. An empty list is a normal
 * 200 — a student who has not completed anything yet simply has no history.
 *
 * Cached in localStorage (lib/completedAttemptsStore.ts) keyed by studentId *and* activityType,
 * the same pattern as loadStudentScore/loadSessions('completed', ...), since the activity detail
 * page otherwise refetches this on every mount. A plain call is served from the cache when
 * present; pass forceRefresh to bypass it and re-cache the server's answer — the play flow does
 * this once a session for that activity completes, since that's the only thing that changes it.
 */
export function loadCompletedAttempts(
  token: string,
  studentId: string,
  activityType: ActivityType,
  options: { forceRefresh?: boolean } = {},
) {
  if (!options.forceRefresh) {
    const cached = getCachedCompletedAttempts(studentId, activityType);
    if (cached !== null) {
      return Promise.resolve<ApiResult<{ attempts: CompletedAttempt[] }>>({ ok: true, data: { attempts: cached } });
    }
  }

  return request<{ attempts: CompletedAttempt[] }>(
    `/api/sessions/completed?activityType=${encodeURIComponent(activityType)}`,
    { method: 'GET' },
    token,
  ).then((result) => {
    if (!result.ok) return result;

    // completedAt comes from session_log.ended_at, which carries no zone — pinned to UTC before
    // it is cached, so a cache hit and a fresh fetch can't disagree about what the value means.
    const attempts = result.data.attempts.map((attempt) => ({
      ...attempt,
      completedAt: attempt.completedAt === null ? null : toInstant(attempt.completedAt),
    }));

    setCachedCompletedAttempts(studentId, activityType, attempts);
    return { ok: true as const, data: { attempts } };
  });
}

/**
 * The student's cumulative score: the sum of their best passing score at each difficulty level
 * of each activity type (REQ-GAM-DL-1). Cached in localStorage (lib/scoreStore.ts) keyed by
 * studentId, since it otherwise gets refetched on every AppShell mount i.e. every navigation.
 * A plain call is served from the cache when present; pass forceRefresh to bypass it and
 * re-cache the server's answer — the play flow does this once a session completes, since
 * that's the only thing that actually changes the score.
 *
 * studentId has to be the authenticated student; the route answers 403 for anyone else.
 */
export function loadStudentScore(
  token: string,
  studentId: string,
  options: { forceRefresh?: boolean } = {},
) {
  if (!options.forceRefresh) {
    const cached = getCachedScore(studentId);
    if (cached !== null) {
      return Promise.resolve<ApiResult<{ score: number }>>({ ok: true, data: { score: cached } });
    }
  }

  return request<{ score: number }>(
    `/api/students/${encodeURIComponent(studentId)}/score`,
    { method: 'GET' },
    token,
  ).then((result) => {
    if (result.ok) {
      setCachedScore(studentId, result.data.score);
    }
    return result;
  });
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
 * confirmed instructor, so there is no studentId to pass: the whole class is the scope.
 *
 * Deliberately **not** cached in localStorage, unlike loadStudentScore/loadSessions('completed')
 * /loadActivityLog. Those four caches are keyed by studentId and hold the student's own data,
 * which only that student's own actions change — so the page that causes a change can
 * forceRefresh it. This list changes whenever *any* student in the class answers, starts or
 * abandons something, and this tab never learns about it, so a cache here would just show
 * an instructor stale results with no invalidation point to fix it.
 */
export function loadInstructorActivities(token: string) {
  return request<{ sessions: InstructorActivityEntry[] }>('/api/instructor/activities', { method: 'GET' }, token);
}

/**
 * The entire question bank (GET /api/instructor/questions, GitHub #170) — what the instructor's
 * Question Bank page renders instead of the old MOCK_QUESTIONS array.
 *
 * Cache-first: returns the stored list on a hit, calls the network only on a miss or when
 * forceRefresh is true — same pattern as loadInstructorStudents. Keyed by instructorId so
 * switching accounts on the same device doesn't serve one instructor's questions to another.
 *
 * createQuestion/updateQuestion (below) only echo back ids, not a full QuizQuestion, so they
 * can't write the cache themselves — app/instructor/questions/page.tsx's handleSaveQuestion
 * does it once it has assembled the saved question, via setCachedInstructorQuestions. That's
 * the invalidation for this cache: a save always leaves it holding the exact list the page just
 * rendered, so the next mount (or another tab) never sees a bank that's missing the new question.
 */
export function loadInstructorQuestions(
  token: string,
  instructorId: string,
  options: { forceRefresh?: boolean } = {},
) {
  if (!options.forceRefresh) {
    const cached = getCachedInstructorQuestions(instructorId);
    if (cached !== null) {
      return Promise.resolve<ApiResult<{ questions: QuizQuestion[] }>>({
        ok: true,
        data: { questions: cached },
      });
    }
  }

  return request<{ questions: QuizQuestion[] }>('/api/instructor/questions', { method: 'GET' }, token).then(
    (result) => {
      if (result.ok) {
        setCachedInstructorQuestions(instructorId, result.data.questions);
      }
      return result;
    },
  );
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

/**
 * Writes the question bank into the cache loadInstructorQuestions reads from. Called by
 * app/instructor/questions/page.tsx's handleSaveQuestion once a createQuestion/updateQuestion
 * response has been merged into the page's list, so the cache is invalidated with the fresh
 * data rather than just dropped — the next load (this tab or another) sees the save immediately
 * instead of falling back to a network round trip.
 */
export function cacheInstructorQuestions(instructorId: string, questions: QuizQuestion[]): void {
  setCachedInstructorQuestions(instructorId, questions);
}

/** One student row as returned by GET /api/instructor/students. */
export type StudentSummary = {
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
};

/**
 * Every student in the system (GET /api/instructor/students, GitHub #146).
 *
 * Cache-first: returns the stored list on a hit, calls the network only on a miss or when
 * forceRefresh is true — same pattern as loadActivityLog. Keyed by instructorId so switching
 * accounts on the same device doesn't serve one instructor's cache to another.
 */
export function loadInstructorStudents(
  token: string,
  instructorId: string,
  options: { forceRefresh?: boolean } = {},
) {
  if (!options.forceRefresh) {
    const cached = getCachedInstructorStudents(instructorId);
    if (cached !== null) {
      return Promise.resolve<ApiResult<{ students: StudentSummary[] }>>({
        ok: true,
        data: { students: cached },
      });
    }
  }

  return request<{ students: StudentSummary[] }>(
    '/api/instructor/students',
    { method: 'GET' },
    token,
  ).then((result) => {
    if (result.ok) {
      setCachedInstructorStudents(instructorId, result.data.students);
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
