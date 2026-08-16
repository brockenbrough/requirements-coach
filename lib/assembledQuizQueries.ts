// GitHub #360: queries backing "compose a quiz from one or more catalogs, scoped to a course" —
// a deliberately separate concept from activity_type ("Question Catalog", GitHub #347/#359,
// still internally called "quiz" in code); see CLAUDE.md for why the two aren't merged.
//
// GitHub #361 added quiz composition management: linking/unlinking catalogs, per-quiz question
// exclusions, and deleting a quiz. "Displayed as copies of the originals" is implemented as an
// exclusion list (quiz_excluded_question), not duplicated question/answer rows — see the table's
// comment in supabase/schema.sql for the full reasoning.

import type { SupabaseClient } from './sessionQueries';
import { shuffleArray } from './shuffleArray';
import { QUESTIONS_PER_SESSION } from './sessionRules';
import { listCatalogQuestions } from './activityTypeQueries';
import type { CatalogQuestion } from './quizQuestionTypes';

const UNIQUE_VIOLATION = '23505';

export type AssembledQuizSummary = {
  id: string;
  name: string;
  description: string | null;
  courseId: string;
  courseName: string;
  catalogNames: string[];
  createdAt: string;
};

type AssembledQuizRow = {
  assembled_quiz_id: string;
  quiz_name: string;
  description: string | null;
  course_id: string;
  created_at: string;
  course: { course_name: string } | null;
  assembled_quiz_catalog: { catalog: { quiz_name: string } | null }[] | null;
};

/**
 * Every assembled quiz the calling instructor created, newest first — scoped to creator_id like
 * listCoursesForInstructor (lib/courseQueries.ts): courses aren't shared the way catalogs are,
 * and neither is a quiz built for one of them.
 */
export async function listAssembledQuizzesForInstructor(supabase: SupabaseClient, instructorId: string) {
  const { data, error } = await supabase
    .from('assembled_quiz')
    .select(
      'assembled_quiz_id, quiz_name, description, course_id, created_at, course:course_id(course_name), assembled_quiz_catalog(catalog:activity_type(quiz_name))',
    )
    .eq('creator_id', instructorId)
    .order('created_at', { ascending: false });

  if (error) return { quizzes: null, error };

  const quizzes: AssembledQuizSummary[] = ((data ?? []) as unknown as AssembledQuizRow[]).map((row) => ({
    id: row.assembled_quiz_id,
    name: row.quiz_name,
    description: row.description,
    courseId: row.course_id,
    courseName: row.course?.course_name ?? 'Unknown course',
    catalogNames: (row.assembled_quiz_catalog ?? []).map((link) => link.catalog?.quiz_name ?? 'Unknown catalog'),
    createdAt: row.created_at,
  }));

  return { quizzes, error: null };
}

export type AssembledQuizRecord = { id: string; name: string; description: string | null; courseId: string };

/**
 * Inserts an assembled_quiz row plus one assembled_quiz_catalog link per catalog. No transaction
 * (the Supabase JS client doesn't offer one, same limitation POST /api/instructor/questions
 * documents) — a link-insert failure deletes the quiz row it was about to belong to, mirroring
 * that route's rollbackAndFail, so a partial write never leaves an orphaned quiz with zero
 * catalogs linked to it.
 */
export async function createAssembledQuiz(
  supabase: SupabaseClient,
  params: { name: string; description: string | null; courseId: string; creatorId: string; catalogActivityTypes: string[] },
): Promise<{ quiz: AssembledQuizRecord | null; error: { message: string } | null }> {
  const assembledQuizId = crypto.randomUUID();

  const { error: quizError } = await supabase.from('assembled_quiz').insert({
    assembled_quiz_id: assembledQuizId,
    quiz_name: params.name,
    description: params.description,
    course_id: params.courseId,
    creator_id: params.creatorId,
  });

  if (quizError) return { quiz: null, error: quizError };

  const { error: linksError } = await supabase.from('assembled_quiz_catalog').insert(
    params.catalogActivityTypes.map((activityType) => ({
      assembled_quiz_id: assembledQuizId,
      activity_type: activityType,
    })),
  );

  if (linksError) {
    await supabase.from('assembled_quiz').delete().eq('assembled_quiz_id', assembledQuizId);
    return { quiz: null, error: linksError };
  }

  return {
    quiz: { id: assembledQuizId, name: params.name, description: params.description, courseId: params.courseId },
    error: null,
  };
}

type AssembledQuizMetaRow = {
  assembled_quiz_id: string;
  quiz_name: string;
  description: string | null;
  course_id: string;
  creator_id: string;
  created_at: string;
};

const ASSEMBLED_QUIZ_COLUMNS = 'assembled_quiz_id, quiz_name, description, course_id, creator_id, created_at';

export type OwnedAssembledQuizResult =
  | { status: 'ok'; quiz: AssembledQuizMetaRow }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'error'; error: { message: string } };

/**
 * Fetches a quiz by id and checks the caller owns it, in one call — the same 404-then-403 shape
 * lib/courseQueries.ts's findOwnedCourse already established for courses (GitHub #241), reused
 * here per GitHub #361's "ownership check on the quiz" requirement so every composition route
 * shares one answer to "does this instructor own this quiz".
 */
export async function findOwnedAssembledQuiz(
  supabase: SupabaseClient,
  quizId: string,
  instructorId: string,
): Promise<OwnedAssembledQuizResult> {
  const { data, error } = await supabase
    .from('assembled_quiz')
    .select(ASSEMBLED_QUIZ_COLUMNS)
    .eq('assembled_quiz_id', quizId)
    .maybeSingle();

  if (error) return { status: 'error', error };
  if (!data) return { status: 'not_found' };

  const quiz = data as AssembledQuizMetaRow;
  if (quiz.creator_id !== instructorId) return { status: 'forbidden' };

  return { status: 'ok', quiz };
}

/** One course name lookup, for the quiz detail route's header — findOwnedAssembledQuiz's own row has no join. */
export async function getCourseName(supabase: SupabaseClient, courseId: string) {
  const { data, error } = await supabase.from('course').select('course_name').eq('course_id', courseId).maybeSingle();
  if (error) return { courseName: null, error };
  return { courseName: (data as { course_name: string } | null)?.course_name ?? null, error: null };
}

/** Deletes the quiz. assembled_quiz_catalog and quiz_excluded_question rows cascade with it (both FK ON DELETE CASCADE) — no separate cleanup needed. */
export async function deleteAssembledQuiz(supabase: SupabaseClient, quizId: string) {
  const { error } = await supabase.from('assembled_quiz').delete().eq('assembled_quiz_id', quizId);
  return { error };
}

/** Every activity_type this quiz currently draws from, for validation and composition queries. */
export async function listQuizCatalogActivityTypes(supabase: SupabaseClient, quizId: string) {
  const { data, error } = await supabase.from('assembled_quiz_catalog').select('activity_type').eq('assembled_quiz_id', quizId);
  if (error) return { activityTypes: null, error };
  return { activityTypes: ((data ?? []) as { activity_type: string }[]).map((row) => row.activity_type), error: null };
}

/**
 * Links a catalog to a quiz. Idempotent on a repeat link (uq_assembled_quiz_catalog, 23505) —
 * treated as success, not an error, the same way lib/courseQueries.ts's enrollStudentInCourse
 * treats a repeat enrollment.
 */
export async function linkCatalogToQuiz(supabase: SupabaseClient, quizId: string, activityType: string) {
  const { error } = await supabase.from('assembled_quiz_catalog').insert({ assembled_quiz_id: quizId, activity_type: activityType });
  if (!error) return { alreadyLinked: false, error: null };
  if (error.code === UNIQUE_VIOLATION) return { alreadyLinked: true, error: null };
  return { alreadyLinked: false, error };
}

/**
 * Unlinks a catalog from a quiz — only the assembled_quiz_catalog row, never the catalog
 * (activity_type) or its questions. Idempotent: deleting a link that's already gone is still
 * success, matching lib/courseQueries.ts's unenrollStudent.
 */
export async function unlinkCatalogFromQuiz(supabase: SupabaseClient, quizId: string, activityType: string) {
  const { error } = await supabase.from('assembled_quiz_catalog').delete().eq('assembled_quiz_id', quizId).eq('activity_type', activityType);
  return { error };
}

/** Every question this quiz currently excludes, as bare ids — the subtraction set for the draw pool and the composition view. */
export async function listQuizExcludedQuestionIds(supabase: SupabaseClient, quizId: string) {
  const { data, error } = await supabase.from('quiz_excluded_question').select('question_id').eq('assembled_quiz_id', quizId);
  if (error) return { excludedIds: null, error };
  return { excludedIds: ((data ?? []) as { question_id: string }[]).map((row) => row.question_id), error: null };
}

/**
 * Excludes one question from one quiz. Never touches `question`/`answer` — this is the whole
 * point of the exclusion-list design (see the table comment in supabase/schema.sql): the original
 * catalog is provably unaffected because nothing here can write to it. Idempotent on a repeat
 * exclude (uq_quiz_excluded_question, 23505), same reasoning as linkCatalogToQuiz above.
 */
export async function excludeQuestionFromQuiz(supabase: SupabaseClient, quizId: string, questionId: string) {
  const { error } = await supabase.from('quiz_excluded_question').insert({ assembled_quiz_id: quizId, question_id: questionId });
  if (!error) return { alreadyExcluded: false, error: null };
  if (error.code === UNIQUE_VIOLATION) return { alreadyExcluded: true, error: null };
  return { alreadyExcluded: false, error };
}

/** Re-includes a previously excluded question. Idempotent: nothing to remove is still success. */
export async function includeQuestionInQuiz(supabase: SupabaseClient, quizId: string, questionId: string) {
  const { error } = await supabase.from('quiz_excluded_question').delete().eq('assembled_quiz_id', quizId).eq('question_id', questionId);
  return { error };
}

export type QuizCatalogComposition = {
  activityType: string;
  name: string;
  description: string | null;
  totalQuestions: number;
  excludedCount: number;
  activeCount: number;
};

export type QuizLevelCoverage = { level: 1 | 2 | 3; available: number; required: number; sufficient: boolean };

function buildLevelCoverage(availableQuestions: readonly { difficulty_level: number }[]): QuizLevelCoverage[] {
  return ([1, 2, 3] as const).map((level) => {
    const available = availableQuestions.filter((q) => q.difficulty_level === level).length;
    return { level, available, required: QUESTIONS_PER_SESSION, sufficient: available >= QUESTIONS_PER_SESSION };
  });
}

type LinkedCatalogRow = { activity_type: string; catalog: { quiz_name: string; description: string | null } | null };
type PoolQuestionRow = { question_id: string; activity_type: string; difficulty_level: number };

/**
 * The quiz's full composition (GitHub #361 requirement 2): every linked catalog with its
 * genuinely-active question count (total minus this quiz's own exclusions — never the catalog's
 * or any other quiz's), plus per-level coverage against QUESTIONS_PER_SESSION so the detail page
 * can warn *before* a student ever hits a level with too few questions left to draw a round
 * (requirement 4). One question query (unfiltered, across every linked catalog) backs both: the
 * per-catalog totals need the unfiltered set, and levelCoverage is the same set minus exclusions.
 */
export async function getQuizComposition(supabase: SupabaseClient, quizId: string) {
  const { data: linkRows, error: linkError } = await supabase
    .from('assembled_quiz_catalog')
    .select('activity_type, catalog:activity_type(quiz_name, description)')
    .eq('assembled_quiz_id', quizId);

  if (linkError) return { catalogs: null, levelCoverage: null, error: linkError };

  const links = (linkRows ?? []) as unknown as LinkedCatalogRow[];
  const catalogActivityTypes = links.map((link) => link.activity_type);

  if (catalogActivityTypes.length === 0) {
    return { catalogs: [] as QuizCatalogComposition[], levelCoverage: buildLevelCoverage([]), error: null };
  }

  const { data: questionRows, error: questionError } = await supabase
    .from('question')
    .select('question_id, activity_type, difficulty_level')
    .in('activity_type', catalogActivityTypes);

  if (questionError) return { catalogs: null, levelCoverage: null, error: questionError };

  const { excludedIds, error: excludedError } = await listQuizExcludedQuestionIds(supabase, quizId);
  if (excludedError) return { catalogs: null, levelCoverage: null, error: excludedError };

  const questions = (questionRows ?? []) as PoolQuestionRow[];
  const excludedSet = new Set(excludedIds ?? []);

  const catalogs: QuizCatalogComposition[] = links.map((link) => {
    const catalogQuestions = questions.filter((q) => q.activity_type === link.activity_type);
    const excludedCount = catalogQuestions.filter((q) => excludedSet.has(q.question_id)).length;

    return {
      activityType: link.activity_type,
      name: link.catalog?.quiz_name ?? link.activity_type,
      description: link.catalog?.description ?? null,
      totalQuestions: catalogQuestions.length,
      excludedCount,
      activeCount: catalogQuestions.length - excludedCount,
    };
  });

  const levelCoverage = buildLevelCoverage(questions.filter((q) => !excludedSet.has(q.question_id)));

  return { catalogs, levelCoverage, error: null };
}

export type QuizScopedQuestion = CatalogQuestion & { excludedForQuiz: boolean };

/**
 * One linked catalog's questions, annotated per-question with whether *this quiz* currently
 * excludes it (GitHub #361 requirement 3) — the "copy of the catalog, in the context of this
 * quiz" view. Delegates the actual question read to lib/activityTypeQueries.ts's
 * listCatalogQuestions (GitHub #359) rather than reimplementing it, so the two views can never
 * disagree about what a catalog's questions look like.
 */
export async function listQuizCatalogQuestions(supabase: SupabaseClient, quizId: string, activityType: string) {
  const { questions, error: questionsError } = await listCatalogQuestions(supabase, activityType);
  if (questionsError || !questions) return { questions: null, error: questionsError };

  const { excludedIds, error: excludedError } = await listQuizExcludedQuestionIds(supabase, quizId);
  if (excludedError) return { questions: null, error: excludedError };

  const excludedSet = new Set(excludedIds ?? []);
  const scoped: QuizScopedQuestion[] = questions.map((question) => ({ ...question, excludedForQuiz: excludedSet.has(question.id) }));

  return { questions: scoped, error: null };
}

/**
 * Picks up to `count` items at random from `pool` — pure, no I/O, so it's trivially testable for
 * pool size and "no duplicates within one draw" without a database. Fisher-Yates
 * (lib/shuffleArray.ts), not a sort comparator, for the same reason app/api/sessions/route.ts's
 * own draw avoids one; `pool` is never mutated. Returns fewer than `count` if the pool itself is
 * smaller — the caller decides whether that's an error (app/api/sessions/route.ts's AC 5 does for
 * a single-catalog Type A activity); no route calls this one yet, since #360/#361's scope is
 * composing a quiz, not yet starting a student attempt against one.
 */
export function pickRandomQuestions<T>(pool: readonly T[], count: number): T[] {
  return shuffleArray(pool as T[]).slice(0, count);
}

export type CatalogQuestionPoolRow = { question_id: string; max_score: number | null; activity_type: string };

/**
 * The live pool an assembled quiz would draw from at one difficulty level: every question across
 * every one of its linked catalogs at that level, minus this quiz's own exclusions (GitHub #361
 * requirement 4 — "excluded questions must never be drawn"). Dynamic, not materialized at
 * quiz-creation time — an instructor editing a linked catalog's questions, or excluding one for
 * this quiz, afterward is reflected immediately, the same "always current" property
 * GET /api/instructor/quizzes/{activityType} (GitHub #359) has for browsing a single catalog.
 */
export async function loadCatalogQuestionPool(
  supabase: SupabaseClient,
  catalogActivityTypes: string[],
  difficultyLevel: number,
  excludedQuestionIds: readonly string[] = [],
): Promise<{ pool: CatalogQuestionPoolRow[] | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('question')
    .select('question_id, max_score, activity_type')
    .in('activity_type', catalogActivityTypes)
    .eq('difficulty_level', difficultyLevel);

  if (error) return { pool: null, error };

  const excludedSet = new Set(excludedQuestionIds);
  const pool = ((data ?? []) as CatalogQuestionPoolRow[]).filter((question) => !excludedSet.has(question.question_id));

  return { pool, error: null };
}
