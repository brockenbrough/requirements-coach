// GitHub #347: shared logic for listing every quiz (activity_type row) with its author and
// question count, so GET /api/instructor/quizzes has exactly one place that defines what a
// "quiz" looks like on the wire.

import type { SupabaseClient } from './sessionQueries';
import type { CatalogQuestion } from './quizQuestionTypes';
import type { CatalogUserStory } from './llmActivityTypes';
import type { ActivityType, GradingKind } from './activityTypes';
import { isGradingKind } from './activityTypes';

export type QuizSummary = {
  activityType: string;
  name: string;
  description: string | null;
  /** The instructor's display name, or 'Built-in' for the three seeded quizzes (creator_id is NULL). */
  authorName: string;
  /** GitHub #379: which pool this catalog holds — question/answer rows ('mcq') or free-text
   *  user_story prompts ('llm-graded'). Chosen once at creation and never edited afterwards. */
  gradingKind: GradingKind;
  /** How many items are in the catalog: questions for 'mcq', prompts for 'llm-graded'. Kept as one
   *  field rather than two so the browse page's existing column needs only a label change — a
   *  catalog only ever has one of the two pools, so a combined count is never ambiguous. */
  questionCount: number;
  /** How many assembled_quiz rows (GitHub #360) currently reference this catalog — a catalog has
   *  no course of its own, so this is the closest honest answer to "where is this used" the
   *  browse page can show. Zero just means nobody has composed it into a quiz yet, not an error. */
  quizCount: number;
};

type QuizRow = {
  activity_type: string;
  quiz_name: string;
  description: string | null;
  grading_kind: string;
  creator_id: string | null;
  creator: { first_name: string | null; last_name: string | null; username: string | null } | null;
  question: { count: number }[] | null;
  user_story: { count: number }[] | null;
  assembled_quiz_catalog: { count: number }[] | null;
};

/**
 * Falls back to 'mcq' for the same reason the column defaults to it in the schema: every
 * activity_type that predates GitHub #379's column drew from question/answer. An unreadable value
 * here is a display concern, not an authorization one — the routes that actually branch on the
 * kind call getGradingKind (lib/activityTypes.ts), which refuses instead of guessing.
 */
function gradingKindOf(row: QuizRow): GradingKind {
  return isGradingKind(row.grading_kind) ? row.grading_kind : 'mcq';
}

function itemCountOf(row: QuizRow, kind: GradingKind): number {
  return kind === 'llm-graded' ? row.user_story?.[0]?.count ?? 0 : row.question?.[0]?.count ?? 0;
}

function authorNameOf(row: QuizRow): string {
  const fullName = [row.creator?.first_name, row.creator?.last_name].filter(Boolean).join(' ').trim();
  return row.creator_id === null ? 'Built-in' : fullName || row.creator?.username || 'Unknown instructor';
}

/**
 * Every quiz in the system — built-in or instructor-created — with its author, question count,
 * and how many assembled quizzes currently reference it, for the instructor-facing browse page.
 * Quizzes are globally shared (not scoped to the calling instructor): anyone can see and reuse
 * anyone else's, which is the entire point of GitHub #347.
 *
 * One query, using the same creator:creator_id(...) + related-table (count) embed pattern
 * lib/courseQueries.ts's listJoinableCourses uses for professor_name/student_count, extended with
 * a second count embed onto assembled_quiz_catalog (the m:n link table from GitHub #360) — author
 * name, question count, and usage count come back on the same row as the quiz itself rather than
 * three round trips merged in JS.
 *
 * GitHub #379: user_story(count) rides along the same way question(count) does — that embed is
 * what fk_user_story_activity_type was added for — and grading_kind decides which of the two
 * counts becomes questionCount. Both are fetched unconditionally because it is one query either
 * way; the unused one is always 0, since a catalog only ever fills one pool.
 */
export async function listQuizzesWithAuthorAndCount(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('activity_type')
    .select(
      'activity_type, quiz_name, description, grading_kind, creator_id, creator:creator_id(first_name, last_name, username), question(count), user_story(count), assembled_quiz_catalog(count)',
    )
    .order('quiz_name', { ascending: true });

  if (error) return { quizzes: null, error };

  const quizzes: QuizSummary[] = ((data ?? []) as unknown as QuizRow[]).map((row) => {
    const gradingKind = gradingKindOf(row);

    return {
      activityType: row.activity_type,
      name: row.quiz_name,
      description: row.description,
      authorName: authorNameOf(row),
      gradingKind,
      questionCount: itemCountOf(row, gradingKind),
      quizCount: row.assembled_quiz_catalog?.[0]?.count ?? 0,
    };
  });

  return { quizzes, error: null };
}

export type QuizMeta = Omit<QuizSummary, 'questionCount' | 'quizCount'>;

/**
 * GitHub #359: one catalog's own metadata (name/description/author), for the catalog detail page
 * — the single-row counterpart to listQuizzesWithAuthorAndCount's list. Returns { quiz: null }
 * (not an error) when activityType matches no row, so the route can turn that into a 404.
 */
export async function getQuizByActivityType(supabase: SupabaseClient, activityType: string) {
  const { data, error } = await supabase
    .from('activity_type')
    .select(
      'activity_type, quiz_name, description, grading_kind, creator_id, creator:creator_id(first_name, last_name, username)',
    )
    .eq('activity_type', activityType)
    .maybeSingle();

  if (error) return { quiz: null, error };
  if (!data) return { quiz: null, error: null };

  const row = data as unknown as QuizRow;

  const quiz: QuizMeta = {
    activityType: row.activity_type,
    name: row.quiz_name,
    description: row.description,
    authorName: authorNameOf(row),
    gradingKind: gradingKindOf(row),
  };

  return { quiz, error: null };
}

/**
 * Every activity_type key this instructor created (creator_id = instructorId), narrowed to one
 * grading_kind. Strict ownership, not "mine or built-in" the way listQuizzesWithAuthorAndCount's
 * shared browse view is — a built-in catalog (creator_id IS NULL) never matches
 * .eq('creator_id', instructorId), for any instructor, on purpose. The scoping primitive behind
 * the Instructor Dashboard's "activity on quizzes/catalogs you created" feed and the matching
 * Acceptance-Criteria submissions/statistics scope.
 *
 * Returns bare activity_type keys, not full rows — every current caller feeds this straight into
 * a subsequent .in('activity_type', …) (or a nested story.activity_type dot-filter).
 */
export async function listOwnedActivityTypes(
  supabase: SupabaseClient,
  instructorId: string,
  gradingKind: GradingKind,
): Promise<{ activityTypes: string[] | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('activity_type')
    .select('activity_type')
    .eq('creator_id', instructorId)
    .eq('grading_kind', gradingKind);

  if (error) return { activityTypes: null, error };

  const activityTypes = (data ?? []).map((row) => (row as { activity_type: string }).activity_type);
  return { activityTypes, error: null };
}

export type OwnedActivityTypeSummary = { activityType: string; name: string; gradingKind: GradingKind };

/**
 * Every activity_type this instructor created, both grading kinds at once, with its display name
 * — the read behind the Instructor Dashboard's stat cards (one per owned catalog, GitHub #171
 * follow-up), which need a name to show and need to know a just-created, zero-attempt catalog
 * exists at all (not just infer ownership from whichever activity types already have attempts).
 *
 * Deliberately not filtered by grading_kind the way listOwnedActivityTypes is — callers that only
 * want one kind (e.g. loadAllStudentActivity's mcq-only session_log scope) filter this result in
 * JS, so a single instructor-facing request only ever needs one activity_type round trip instead
 * of one per grading kind.
 *
 * No explicit return-type annotation: leaving it to inference keeps
 * `{ activityTypeSummaries: null, error }` / `{ activityTypeSummaries: T[], error: null }`
 * a clean discriminated union callers can narrow with a plain `if (error) return …` — an explicit
 * `Promise<{...}>` annotation here previously broke that narrowing for listOwnedActivityTypes and
 * caused a real build failure; see that history before changing this back.
 */
export async function listOwnedActivityTypeSummaries(supabase: SupabaseClient, instructorId: string) {
  const { data, error } = await supabase
    .from('activity_type')
    .select('activity_type, quiz_name, grading_kind')
    .eq('creator_id', instructorId);

  if (error) return { activityTypeSummaries: null, error };

  const activityTypeSummaries: OwnedActivityTypeSummary[] = (data ?? []).map((row) => {
    const r = row as { activity_type: string; quiz_name: string; grading_kind: string };
    return { activityType: r.activity_type, name: r.quiz_name, gradingKind: r.grading_kind as GradingKind };
  });

  return { activityTypeSummaries, error: null };
}

type CatalogQuestionRow = {
  question_id: string;
  question_prompt: string;
  difficulty_level: number;
  user_id: string | null;
  question_to_answer: { answer: { answer_id: string; option_text: string; is_correct: boolean; explanation: string | null } | null }[];
};

/**
 * GitHub #359: every question in one catalog (activity_type), any author — the read-only view a
 * catalog's detail page shows before "Edit" is clicked. Unlike GET /api/instructor/questions
 * (scoped to question.user_id = the caller), this deliberately returns every question in the
 * catalog: quizzes are shared, so browsing a colleague's catalog must show what's actually in it,
 * not just the rows the caller happens to own. ownerId travels along so the client can decide
 * whose rows get Edit/Delete icons without a second round trip.
 */
export async function listCatalogQuestions(supabase: SupabaseClient, activityType: string) {
  const { data, error } = await supabase
    .from('question')
    .select(
      'question_id, question_prompt, difficulty_level, user_id, question_to_answer(answer:answer_id(answer_id, option_text, is_correct, explanation))',
    )
    .eq('activity_type', activityType)
    .order('difficulty_level', { ascending: true })
    .order('order_number', { ascending: true });

  if (error) return { questions: null, error };

  const questions: CatalogQuestion[] = ((data ?? []) as unknown as CatalogQuestionRow[]).map((row) => {
    const answers = row.question_to_answer.map((link) => link.answer).filter((a): a is NonNullable<typeof a> => a !== null);
    const correctAnswer = answers.find((a) => a.is_correct);

    return {
      id: row.question_id,
      quizType: activityType as ActivityType,
      level: row.difficulty_level as 1 | 2 | 3,
      questionText: row.question_prompt,
      answerOptions: answers.map((a) => ({ id: a.answer_id, text: a.option_text, isCorrect: a.is_correct })),
      explanation: correctAnswer?.explanation ?? '',
      ownerId: row.user_id,
    };
  });

  return { questions, error: null };
}

type CatalogUserStoryRow = {
  user_story_id: string;
  story_text: string;
  difficulty_level: number;
  creator_id: string | null;
};

/**
 * GitHub #379: every prompt in one LLM-graded catalog, any author — the free-text counterpart to
 * listCatalogQuestions above, and read by the same catalog detail page.
 *
 * Same "catalogs are shared" scoping decision as that function: this returns the whole catalog
 * rather than only the caller's own rows (which is what GET /api/instructor/user-stories does),
 * and ownerId travels along so the page can decide whose rows get Edit/Delete icons without a
 * second round trip.
 *
 * Ordered by level, then by text. There is no order_number on user_story the way there is on
 * question, so text is the tiebreaker — it is stable and it makes the list read alphabetically
 * within a level rather than in whatever order Postgres happens to return.
 */
export async function listCatalogUserStories(supabase: SupabaseClient, activityType: string) {
  const { data, error } = await supabase
    .from('user_story')
    .select('user_story_id, story_text, difficulty_level, creator_id')
    .eq('activity_type', activityType)
    .order('difficulty_level', { ascending: true })
    .order('story_text', { ascending: true });

  if (error) return { userStories: null, error };

  const userStories: CatalogUserStory[] = ((data ?? []) as unknown as CatalogUserStoryRow[]).map((row) => ({
    id: row.user_story_id,
    activityType: activityType as ActivityType,
    level: row.difficulty_level as 1 | 2 | 3,
    storyText: row.story_text,
    ownerId: row.creator_id,
  }));

  return { userStories, error: null };
}
