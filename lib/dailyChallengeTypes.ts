// The shapes the Daily Challenge routes (GitHub #337) travel over the wire — mirrors
// lib/sessionTypes.ts's role. Deliberately imports nothing, same reasoning: it stays readable by
// both lib/dailyChallengeClient.ts ('use client') and, if a server module ever needs the same
// shape, without dragging a client-only module (or the service-role key) across that boundary.

export type DailyChallengeOption = {
  answer_id: string;
  option_text: string;
  // Only present once the attempt is submitted (loadDailyChallengeQuestionWithSolution in
  // lib/dailyChallengeQueries.ts) — absent before that, the same non-disclosure boundary the API
  // itself enforces (see loadDailyChallengeQuestion vs. …WithSolution).
  explanation?: string | null;
  is_correct?: boolean | null;
};

export type DailyChallengeQuestion = {
  question_id: string;
  question_prompt: string;
  difficulty_level: number;
  activity_type: string;
  max_score: number;
  options: DailyChallengeOption[];
};

/** One row of daily_challenge_attempt, exactly as the routes disclose it. */
export type DailyChallengeAttempt = {
  daily_challenge_attempt_id: string;
  user_id: string;
  question_id: string;
  challenge_date: string;
  started_at: string;
  deadline_at: string;
  submitted_option: string | null;
  is_correct: boolean | null;
  score: number | null;
  submitted_at: string | null;
};

/**
 * The shape GET/POST /api/daily-challenge both return — see app/api/daily-challenge/route.ts's
 * buildAttemptResponse for the exact branching. `available` only appears when `attempt` is null
 * (nothing drawn yet today); `expired`/`correct`/`score`/`explanation` only appear once an
 * attempt exists; `resumed` only appears on the POST response.
 */
export type DailyChallengeState = {
  attempt: DailyChallengeAttempt | null;
  available?: boolean;
  question: DailyChallengeQuestion | null;
  expired?: boolean;
  correct?: boolean | null;
  score?: number | null;
  explanation?: string | null;
  resumed?: boolean;
};

/** POST /api/daily-challenge/{attemptId}/answers's success response. */
export type DailyChallengeAnswerResult = {
  attempt: DailyChallengeAttempt;
  correct: boolean;
  explanation: string | null;
  score: number;
};
