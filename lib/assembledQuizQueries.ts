// GitHub #360: queries backing "compose a quiz from one or more catalogs, scoped to a course" —
// a deliberately separate concept from activity_type ("Question Catalog", GitHub #347/#359,
// still internally called "quiz" in code); see CLAUDE.md for why the two aren't merged.
//
// GitHub #361 added quiz composition management: linking/unlinking catalogs, per-quiz question
// exclusions, and deleting a quiz. "Displayed as copies of the originals" is implemented as an
// exclusion list (quiz_excluded_question), not duplicated question/answer rows — see the table's
// comment in supabase/schema.sql for the full reasoning.
//
// GitHub #380 added the inverse: hand-picking an individual question directly onto a quiz
// (assembled_quiz_extra_question), independent of whether its catalog is linked at all. See that
// table's own header comment in supabase/schema.sql, and loadCatalogQuestionPool's docblock below
// for the exact pool formula and the exclude-vs-hand-pick conflict rule.

import type { SupabaseClient } from './sessionQueries';
import { shuffleArray } from './shuffleArray';
import { QUESTIONS_PER_SESSION } from './sessionRules';
import { listCatalogQuestions, listCatalogUserStories } from './activityTypeQueries';
import type { CatalogQuestion } from './quizQuestionTypes';
import type { CatalogUserStory } from './llmActivityTypes';
import type { GradingKind } from './activityTypes';

const UNIQUE_VIOLATION = '23505';

export type AssembledQuizSummary = {
  id: string;
  name: string;
  description: string | null;
  courseId: string;
  courseName: string;
  /** GitHub: the single catalog kind this quiz may ever compose/hand-pick from — see assembled_quiz.grading_kind's own comment in supabase/schema.sql. */
  gradingKind: GradingKind;
  /** GitHub #416: how many questions/prompts a session draws per level for this quiz — see assembled_quiz.questions_per_level's own comment in supabase/schema.sql. */
  questionsPerLevel: number;
  catalogs: { activityType: string; name: string; gradingKind: GradingKind }[];
  catalogNames: string[];
  createdAt: string;
};

type AssembledQuizRow = {
  assembled_quiz_id: string;
  quiz_name: string;
  description: string | null;
  course_id: string;
  grading_kind: string;
  questions_per_level: number;
  created_at: string;
  course: { course_name: string } | null;
  assembled_quiz_catalog: { activity_type: string; catalog: { quiz_name: string; grading_kind: string } | null }[] | null;
};

const ASSEMBLED_QUIZ_SUMMARY_SELECT =
  'assembled_quiz_id, quiz_name, description, course_id, grading_kind, questions_per_level, created_at, course:course_id(course_name), assembled_quiz_catalog(activity_type, catalog:activity_type(quiz_name, grading_kind))';

function mapAssembledQuizRow(row: AssembledQuizRow): AssembledQuizSummary {
  const catalogs = (row.assembled_quiz_catalog ?? []).map((link) => ({
    activityType: link.activity_type,
    name: link.catalog?.quiz_name ?? 'Unknown catalog',
    gradingKind: (link.catalog?.grading_kind === 'llm-graded' ? 'llm-graded' : 'mcq') as GradingKind,
  }));
  return {
    id: row.assembled_quiz_id,
    name: row.quiz_name,
    description: row.description,
    courseId: row.course_id,
    courseName: row.course?.course_name ?? 'Unknown course',
    gradingKind: row.grading_kind === 'llm-graded' ? 'llm-graded' : 'mcq',
    questionsPerLevel: row.questions_per_level,
    catalogs,
    catalogNames: catalogs.map((c) => c.name),
    createdAt: row.created_at,
  };
}

/**
 * Every assembled quiz the calling instructor created, newest first — scoped to creator_id like
 * listCoursesForInstructor (lib/courseQueries.ts): courses aren't shared the way catalogs are,
 * and neither is a quiz built for one of them.
 */
export async function listAssembledQuizzesForInstructor(supabase: SupabaseClient, instructorId: string) {
  const { data, error } = await supabase
    .from('assembled_quiz')
    .select(ASSEMBLED_QUIZ_SUMMARY_SELECT)
    .eq('creator_id', instructorId)
    .order('created_at', { ascending: false });

  if (error) return { quizzes: null, error };

  const quizzes = ((data ?? []) as unknown as AssembledQuizRow[]).map(mapAssembledQuizRow);
  return { quizzes, error: null };
}

/**
 * Every assembled quiz belonging to one course, newest first — the course detail page's own
 * "Quizzes" section (GitHub #362 follow-up). Same row shape and embed as
 * listAssembledQuizzesForInstructor just above (mapAssembledQuizRow is shared between the two so
 * the mapping can't drift), scoped by course_id instead of creator_id: a course's quizzes are
 * exactly the assembled_quiz rows that name it, regardless of which of this course's
 * collaborators — today, only its one owning instructor, courses aren't shared — created them.
 */
export async function listAssembledQuizzesForCourse(supabase: SupabaseClient, courseId: string) {
  const { data, error } = await supabase
    .from('assembled_quiz')
    .select(ASSEMBLED_QUIZ_SUMMARY_SELECT)
    .eq('course_id', courseId)
    .order('created_at', { ascending: false });

  if (error) return { quizzes: null, error };

  const quizzes = ((data ?? []) as unknown as AssembledQuizRow[]).map(mapAssembledQuizRow);
  return { quizzes, error: null };
}

export type AssembledQuizRecord = {
  id: string;
  name: string;
  description: string | null;
  courseId: string;
  gradingKind: GradingKind;
  questionsPerLevel: number;
};

/**
 * Inserts an assembled_quiz row plus one assembled_quiz_catalog link per catalog. No transaction
 * (the Supabase JS client doesn't offer one, same limitation POST /api/instructor/questions
 * documents) — a link-insert failure deletes the quiz row it was about to belong to, mirroring
 * that route's rollbackAndFail, so a partial write never leaves an orphaned quiz with zero
 * catalogs linked to it.
 *
 * gradingKind is required, not inferred from catalogActivityTypes — the caller (the POST route)
 * already validated every catalog matches it, and locking the value in here rather than deriving
 * it is what makes the column meaningful once catalogs are later added/removed.
 *
 * questionsPerLevel (GitHub #416) is required too, not left to the column's own DB default — the
 * route validates and fills in the same default (4) itself when the instructor doesn't set one,
 * so this function never has to guess whether an omission was deliberate.
 */
export async function createAssembledQuiz(
  supabase: SupabaseClient,
  params: {
    name: string;
    description: string | null;
    courseId: string;
    creatorId: string;
    gradingKind: GradingKind;
    questionsPerLevel: number;
    catalogActivityTypes: string[];
  },
): Promise<{ quiz: AssembledQuizRecord | null; error: { message: string } | null }> {
  const assembledQuizId = crypto.randomUUID();

  const { error: quizError } = await supabase.from('assembled_quiz').insert({
    assembled_quiz_id: assembledQuizId,
    quiz_name: params.name,
    description: params.description,
    course_id: params.courseId,
    creator_id: params.creatorId,
    grading_kind: params.gradingKind,
    questions_per_level: params.questionsPerLevel,
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
    quiz: {
      id: assembledQuizId,
      name: params.name,
      description: params.description,
      courseId: params.courseId,
      gradingKind: params.gradingKind,
      questionsPerLevel: params.questionsPerLevel,
    },
    error: null,
  };
}

type AssembledQuizMetaRow = {
  assembled_quiz_id: string;
  quiz_name: string;
  description: string | null;
  course_id: string;
  creator_id: string;
  grading_kind: string;
  questions_per_level: number;
  created_at: string;
};

const ASSEMBLED_QUIZ_COLUMNS =
  'assembled_quiz_id, quiz_name, description, course_id, creator_id, grading_kind, questions_per_level, created_at';

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
export type CourseQuizStat = {
  quizId: string;
  quizName: string;
  classAverage: number;
  passRate: number;
  completionCount: number;
  enrolledCount: number;
};

/**
 * Per-assembled-quiz stats for a course: class average, pass rate, and how many enrolled
 * students completed at least one session for any catalog in that quiz.
 */
export async function computeCourseQuizStats(
  supabase: SupabaseClient,
  courseId: string,
): Promise<{ stats: CourseQuizStat[] | null; error: { message: string } | null }> {
  type QuizRow = {
    assembled_quiz_id: string;
    quiz_name: string;
    assembled_quiz_catalog: { activity_type: string }[] | null;
  };
  type SessionRow = { activity_type: string; cumulative_score: number; max_score: number; passed: boolean; user_id: string };

  const [quizzesResult, enrolledResult] = await Promise.all([
    supabase
      .from('assembled_quiz')
      .select('assembled_quiz_id, quiz_name, assembled_quiz_catalog(activity_type)')
      .eq('course_id', courseId),
    supabase.from('student_course').select('user_id').eq('course_id', courseId),
  ]);

  if (quizzesResult.error) return { stats: null, error: quizzesResult.error };
  if (enrolledResult.error) return { stats: null, error: enrolledResult.error };

  const quizzes = (quizzesResult.data ?? []) as unknown as QuizRow[];
  const studentIds = ((enrolledResult.data ?? []) as { user_id: string }[]).map((r) => r.user_id);
  const enrolledCount = studentIds.length;

  if (quizzes.length === 0) return { stats: [], error: null };

  const allActivityTypes = [...new Set(quizzes.flatMap((q) => (q.assembled_quiz_catalog ?? []).map((c) => c.activity_type)))];

  let sessionQuery = supabase
    .from('session_log')
    .select('activity_type, cumulative_score, max_score, passed, user_id')
    .eq('status', 'completed')
    .in('activity_type', allActivityTypes);

  if (studentIds.length > 0) sessionQuery = sessionQuery.in('user_id', studentIds);

  const { data: sessionRows, error: sessionError } = await sessionQuery;
  if (sessionError) return { stats: null, error: sessionError };

  const sessions = (sessionRows ?? []) as SessionRow[];

  const stats: CourseQuizStat[] = quizzes.map((quiz) => {
    const quizActivityTypes = new Set((quiz.assembled_quiz_catalog ?? []).map((c) => c.activity_type));
    const quizSessions = sessions.filter((s) => quizActivityTypes.has(s.activity_type));

    const completionCount = new Set(quizSessions.map((s) => s.user_id)).size;

    if (quizSessions.length === 0) {
      return { quizId: quiz.assembled_quiz_id, quizName: quiz.quiz_name, classAverage: 0, passRate: 0, completionCount, enrolledCount };
    }

    const totalPercent = quizSessions.reduce((sum, s) => sum + (s.max_score > 0 ? (s.cumulative_score / s.max_score) * 100 : 0), 0);
    const passCount = quizSessions.filter((s) => s.passed).length;

    return {
      quizId: quiz.assembled_quiz_id,
      quizName: quiz.quiz_name,
      classAverage: Math.round(totalPercent / quizSessions.length),
      passRate: Math.round((passCount / quizSessions.length) * 100),
      completionCount,
      enrolledCount,
    };
  });

  return { stats, error: null };
}

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

/** Every question this quiz has hand-picked directly (assembled_quiz_extra_question), as bare ids. */
export async function listQuizExtraQuestionIds(supabase: SupabaseClient, quizId: string) {
  const { data, error } = await supabase.from('assembled_quiz_extra_question').select('question_id').eq('assembled_quiz_id', quizId);
  if (error) return { extraIds: null, error };
  return { extraIds: ((data ?? []) as { question_id: string }[]).map((row) => row.question_id), error: null };
}

/**
 * Hand-picks one question directly onto a quiz (GitHub #380), independent of whether its catalog
 * is one of the quiz's linked catalogs (assembled_quiz_catalog) at all — see
 * assembled_quiz_extra_question's own header comment in supabase/schema.sql. Never touches
 * `question`/`answer`, same reasoning as excludeQuestionFromQuiz. Idempotent on a repeat pick
 * (uq_assembled_quiz_extra_question, 23505).
 */
export async function addExtraQuestionToQuiz(supabase: SupabaseClient, quizId: string, questionId: string) {
  const { error } = await supabase.from('assembled_quiz_extra_question').insert({ assembled_quiz_id: quizId, question_id: questionId });
  if (!error) return { alreadyPicked: false, error: null };
  if (error.code === UNIQUE_VIOLATION) return { alreadyPicked: true, error: null };
  return { alreadyPicked: false, error };
}

/**
 * Removes a hand-picked question from a quiz — only the assembled_quiz_extra_question row. The
 * original question row, its catalog, and every other quiz that references it are untouched.
 * Idempotent: removing a question that isn't currently hand-picked is still success, matching
 * includeQuestionInQuiz above.
 */
export async function removeExtraQuestionFromQuiz(supabase: SupabaseClient, quizId: string, questionId: string) {
  const { error } = await supabase.from('assembled_quiz_extra_question').delete().eq('assembled_quiz_id', quizId).eq('question_id', questionId);
  return { error };
}

/**
 * Every user_story this quiz currently excludes, as bare ids — the llm-graded counterpart of
 * listQuizExcludedQuestionIds, same subtraction-set role for the composition view (no live draw
 * pool exists for llm-graded quizzes yet, so this has no loadCatalogQuestionPool counterpart).
 */
export async function listQuizExcludedUserStoryIds(supabase: SupabaseClient, quizId: string) {
  const { data, error } = await supabase.from('quiz_excluded_user_story').select('user_story_id').eq('assembled_quiz_id', quizId);
  if (error) return { excludedIds: null, error };
  return { excludedIds: ((data ?? []) as { user_story_id: string }[]).map((row) => row.user_story_id), error: null };
}

/** Excludes one user_story from one quiz. Mirrors excludeQuestionFromQuiz — never touches `user_story` itself, idempotent on a repeat exclude (uq_quiz_excluded_user_story, 23505). */
export async function excludeUserStoryFromQuiz(supabase: SupabaseClient, quizId: string, userStoryId: string) {
  const { error } = await supabase.from('quiz_excluded_user_story').insert({ assembled_quiz_id: quizId, user_story_id: userStoryId });
  if (!error) return { alreadyExcluded: false, error: null };
  if (error.code === UNIQUE_VIOLATION) return { alreadyExcluded: true, error: null };
  return { alreadyExcluded: false, error };
}

/** Re-includes a previously excluded user_story. Idempotent: nothing to remove is still success. */
export async function includeUserStoryInQuiz(supabase: SupabaseClient, quizId: string, userStoryId: string) {
  const { error } = await supabase.from('quiz_excluded_user_story').delete().eq('assembled_quiz_id', quizId).eq('user_story_id', userStoryId);
  return { error };
}

/** Every user_story this quiz has hand-picked directly (assembled_quiz_extra_user_story), as bare ids. */
export async function listQuizExtraUserStoryIds(supabase: SupabaseClient, quizId: string) {
  const { data, error } = await supabase.from('assembled_quiz_extra_user_story').select('user_story_id').eq('assembled_quiz_id', quizId);
  if (error) return { extraIds: null, error };
  return { extraIds: ((data ?? []) as { user_story_id: string }[]).map((row) => row.user_story_id), error: null };
}

/**
 * Hand-picks one user_story directly onto a quiz, independent of whether its catalog is one of
 * the quiz's linked catalogs at all — the llm-graded counterpart of addExtraQuestionToQuiz. Never
 * touches `user_story`, idempotent on a repeat pick (uq_assembled_quiz_extra_user_story, 23505).
 */
export async function addExtraUserStoryToQuiz(supabase: SupabaseClient, quizId: string, userStoryId: string) {
  const { error } = await supabase.from('assembled_quiz_extra_user_story').insert({ assembled_quiz_id: quizId, user_story_id: userStoryId });
  if (!error) return { alreadyPicked: false, error: null };
  if (error.code === UNIQUE_VIOLATION) return { alreadyPicked: true, error: null };
  return { alreadyPicked: false, error };
}

/**
 * Removes a hand-picked user_story from a quiz — only the assembled_quiz_extra_user_story row.
 * The original user_story row, its catalog, and every other quiz that references it are
 * untouched. Idempotent, matching removeExtraQuestionFromQuiz.
 */
export async function removeExtraUserStoryFromQuiz(supabase: SupabaseClient, quizId: string, userStoryId: string) {
  const { error } = await supabase.from('assembled_quiz_extra_user_story').delete().eq('assembled_quiz_id', quizId).eq('user_story_id', userStoryId);
  return { error };
}

/**
 * Fetches one question's display summary (question text, level, source catalog) by id — used by
 * GitHub #380's create-and-hand-pick route to hand the freshly created, freshly hand-picked
 * question straight back to the caller in the same shape as getQuizComposition's `extraQuestions`,
 * so the composition page can append it to local state without a full refetch.
 */
export async function getExtraQuestionSummary(supabase: SupabaseClient, questionId: string) {
  const { data, error } = await supabase
    .from('question')
    .select('question_id, question_prompt, difficulty_level, activity_type, catalog:activity_type(quiz_name)')
    .eq('question_id', questionId)
    .maybeSingle();

  if (error) return { summary: null, error };
  if (!data) return { summary: null, error: null };

  const row = data as unknown as ExtraQuestionRow;
  const summary: QuizExtraQuestionSummary = {
    questionId: row.question_id,
    questionText: row.question_prompt,
    level: row.difficulty_level as 1 | 2 | 3,
    catalogActivityType: row.activity_type,
    catalogName: row.catalog?.quiz_name ?? row.activity_type,
  };

  return { summary, error: null };
}

/**
 * The llm-graded counterpart of getExtraQuestionSummary — fetches one user_story's display
 * summary (story text, level, source catalog) by id, used by the create-and-hand-pick prompt
 * route to hand the freshly created, freshly hand-picked prompt straight back to the caller in
 * the same shape as getQuizComposition's `extraUserStories`.
 */
export async function getExtraUserStorySummary(supabase: SupabaseClient, userStoryId: string) {
  const { data, error } = await supabase
    .from('user_story')
    .select('user_story_id, story_text, difficulty_level, activity_type, catalog:activity_type(quiz_name)')
    .eq('user_story_id', userStoryId)
    .maybeSingle();

  if (error) return { summary: null, error };
  if (!data) return { summary: null, error: null };

  const row = data as unknown as ExtraUserStoryRow;
  const summary: QuizExtraUserStorySummary = {
    userStoryId: row.user_story_id,
    storyText: row.story_text,
    level: row.difficulty_level as 1 | 2 | 3,
    catalogActivityType: row.activity_type,
    catalogName: row.catalog?.quiz_name ?? row.activity_type,
  };

  return { summary, error: null };
}

export type QuizCatalogComposition = {
  activityType: string;
  name: string;
  description: string | null;
  /** Which pool totalQuestions/activeCount are counted from — question rows for 'mcq', user_story
   *  rows for 'llm-graded'. A catalog only ever fills one pool, same as QuizSummary's own field. */
  gradingKind: GradingKind;
  totalQuestions: number;
  excludedCount: number;
  activeCount: number;
};

export type QuizLevelCoverage = { level: 1 | 2 | 3; available: number; required: number; sufficient: boolean };

// GitHub #416: required defaults to QUESTIONS_PER_SESSION but callers pass the quiz's own
// questions_per_level so the coverage banner warns against what a session here will actually try
// to draw, not the app-wide default.
function buildLevelCoverage(
  availableQuestions: readonly { difficulty_level: number }[],
  required: number = QUESTIONS_PER_SESSION,
): QuizLevelCoverage[] {
  return ([1, 2, 3] as const).map((level) => {
    const available = availableQuestions.filter((q) => q.difficulty_level === level).length;
    return { level, available, required, sufficient: available >= required };
  });
}

type LinkedCatalogRow = {
  activity_type: string;
  catalog: { quiz_name: string; description: string | null; grading_kind: string } | null;
};
type PoolQuestionRow = { question_id: string; activity_type: string; difficulty_level: number };
type PoolUserStoryRow = { user_story_id: string; activity_type: string; difficulty_level: number };

export type QuizExtraQuestionSummary = {
  questionId: string;
  questionText: string;
  level: 1 | 2 | 3;
  catalogActivityType: string;
  catalogName: string;
};

type ExtraQuestionRow = {
  question_id: string;
  question_prompt: string;
  difficulty_level: number;
  activity_type: string;
  catalog: { quiz_name: string } | null;
};

/** The llm-graded counterpart of QuizExtraQuestionSummary — one hand-picked prompt, with its source catalog for display. */
export type QuizExtraUserStorySummary = {
  userStoryId: string;
  storyText: string;
  level: 1 | 2 | 3;
  catalogActivityType: string;
  catalogName: string;
};

type ExtraUserStoryRow = {
  user_story_id: string;
  story_text: string;
  difficulty_level: number;
  activity_type: string;
  catalog: { quiz_name: string } | null;
};

type GetQuizCompositionResult = {
  catalogs: QuizCatalogComposition[] | null;
  levelCoverage: QuizLevelCoverage[] | null;
  extraQuestions: QuizExtraQuestionSummary[] | null;
  extraUserStories: QuizExtraUserStorySummary[] | null;
  activeCatalogQuestionIds: string[] | null;
  activeCatalogUserStoryIds: string[] | null;
  error: { message: string } | null;
};

function compositionFailure(error: { message: string }): GetQuizCompositionResult {
  return {
    catalogs: null,
    levelCoverage: null,
    extraQuestions: null,
    extraUserStories: null,
    activeCatalogQuestionIds: null,
    activeCatalogUserStoryIds: null,
    error,
  };
}

/**
 * The quiz's full composition (GitHub #361 requirement 2, extended by GitHub #380 and by the
 * llm-graded parity that added quiz_excluded_user_story/assembled_quiz_extra_user_story): every
 * linked catalog with its genuinely-active question or prompt count (total minus this quiz's own
 * exclusions — never the catalog's or any other quiz's), every individually hand-picked question
 * or prompt with its source catalog for display, and per-level coverage against this quiz's own
 * questionsPerLevel (GitHub #416; the caller passes it since it already has the quiz's meta row)
 * so the detail page can warn *before* a student ever hits a level with too few questions left to
 * draw a round (requirement 4) — counting hand-picked items toward that coverage too, since they
 * are genuinely drawable (see loadCatalogQuestionPool's own docblock for the identical MCQ pool
 * formula; no equivalent draw exists yet for llm-graded quizzes).
 *
 * mcq and llm-graded are handled by fully parallel code paths throughout — question/
 * quiz_excluded_question/assembled_quiz_extra_question on one side, user_story/
 * quiz_excluded_user_story/assembled_quiz_extra_user_story on the other — rather than one
 * generalized path, because the two pools live in different tables with different FKs; a linked
 * catalog is always exactly one kind (activity_type.grading_kind), never both.
 *
 * Hand-picked items are fetched and returned independent of whether the quiz has any linked
 * catalogs at all (AC: "Ein Catalog muss dafür NICHT als Ganzes mit dem Quiz verknüpft sein") —
 * the early return below only skips the *catalog*-derived queries, never the extra-item ones.
 *
 * activeCatalogQuestionIds/activeCatalogUserStoryIds are the bare ids behind `catalogs`'
 * per-catalog counts — the "Add individual questions" picker (AddQuizQuestionsModal) needs
 * individual ids, not aggregate numbers, to mark a catalog-sourced item as already in the quiz;
 * reusing the already-fetched catalogActiveQuestions/catalogActiveUserStories arrays here avoids a
 * second query just for that.
 */
export async function getQuizComposition(
  supabase: SupabaseClient,
  quizId: string,
  questionsPerLevel: number = QUESTIONS_PER_SESSION,
): Promise<GetQuizCompositionResult> {
  const { data: linkRows, error: linkError } = await supabase
    .from('assembled_quiz_catalog')
    .select('activity_type, catalog:activity_type(quiz_name, description, grading_kind)')
    .eq('assembled_quiz_id', quizId);

  if (linkError) return compositionFailure(linkError);

  const links = (linkRows ?? []) as unknown as LinkedCatalogRow[];
  const catalogActivityTypes = links.map((link) => link.activity_type);
  const llmActivityTypes = links
    .filter((link) => link.catalog?.grading_kind === 'llm-graded')
    .map((link) => link.activity_type);

  let questions: PoolQuestionRow[] = [];
  let userStories: PoolUserStoryRow[] = [];
  let catalogs: QuizCatalogComposition[] = [];
  let excludedQuestionSet = new Set<string>();
  let excludedUserStorySet = new Set<string>();

  if (catalogActivityTypes.length > 0) {
    const { data: questionRows, error: questionError } = await supabase
      .from('question')
      .select('question_id, activity_type, difficulty_level')
      .in('activity_type', catalogActivityTypes);

    if (questionError) return compositionFailure(questionError);

    const { excludedIds: excludedQuestionIds, error: excludedQuestionError } = await listQuizExcludedQuestionIds(supabase, quizId);
    if (excludedQuestionError) return compositionFailure(excludedQuestionError);

    questions = (questionRows ?? []) as PoolQuestionRow[];
    excludedQuestionSet = new Set(excludedQuestionIds ?? []);

    if (llmActivityTypes.length > 0) {
      const { data: userStoryRows, error: userStoryError } = await supabase
        .from('user_story')
        .select('user_story_id, activity_type, difficulty_level')
        .in('activity_type', llmActivityTypes);

      if (userStoryError) return compositionFailure(userStoryError);

      const { excludedIds: excludedUserStoryIds, error: excludedUserStoryError } = await listQuizExcludedUserStoryIds(supabase, quizId);
      if (excludedUserStoryError) return compositionFailure(excludedUserStoryError);

      userStories = (userStoryRows ?? []) as PoolUserStoryRow[];
      excludedUserStorySet = new Set(excludedUserStoryIds ?? []);
    }

    catalogs = links.map((link) => {
      const gradingKind: GradingKind = link.catalog?.grading_kind === 'llm-graded' ? 'llm-graded' : 'mcq';

      if (gradingKind === 'llm-graded') {
        const catalogStories = userStories.filter((s) => s.activity_type === link.activity_type);
        const excludedCount = catalogStories.filter((s) => excludedUserStorySet.has(s.user_story_id)).length;

        return {
          activityType: link.activity_type,
          name: link.catalog?.quiz_name ?? link.activity_type,
          description: link.catalog?.description ?? null,
          gradingKind,
          totalQuestions: catalogStories.length,
          excludedCount,
          activeCount: catalogStories.length - excludedCount,
        };
      }

      const catalogQuestions = questions.filter((q) => q.activity_type === link.activity_type);
      const excludedCount = catalogQuestions.filter((q) => excludedQuestionSet.has(q.question_id)).length;

      return {
        activityType: link.activity_type,
        name: link.catalog?.quiz_name ?? link.activity_type,
        description: link.catalog?.description ?? null,
        gradingKind,
        totalQuestions: catalogQuestions.length,
        excludedCount,
        activeCount: catalogQuestions.length - excludedCount,
      };
    });
  }

  const { extraIds: extraQuestionIds, error: extraQuestionIdsError } = await listQuizExtraQuestionIds(supabase, quizId);
  if (extraQuestionIdsError) return compositionFailure(extraQuestionIdsError);

  let extraQuestions: QuizExtraQuestionSummary[] = [];
  if ((extraQuestionIds ?? []).length > 0) {
    const { data: extraRows, error: extraRowsError } = await supabase
      .from('question')
      .select('question_id, question_prompt, difficulty_level, activity_type, catalog:activity_type(quiz_name)')
      .in('question_id', extraQuestionIds ?? []);

    if (extraRowsError) return compositionFailure(extraRowsError);

    extraQuestions = ((extraRows ?? []) as unknown as ExtraQuestionRow[]).map((row) => ({
      questionId: row.question_id,
      questionText: row.question_prompt,
      level: row.difficulty_level as 1 | 2 | 3,
      catalogActivityType: row.activity_type,
      catalogName: row.catalog?.quiz_name ?? row.activity_type,
    }));
  }

  const { extraIds: extraUserStoryIds, error: extraUserStoryIdsError } = await listQuizExtraUserStoryIds(supabase, quizId);
  if (extraUserStoryIdsError) return compositionFailure(extraUserStoryIdsError);

  let extraUserStories: QuizExtraUserStorySummary[] = [];
  if ((extraUserStoryIds ?? []).length > 0) {
    const { data: extraStoryRows, error: extraStoryRowsError } = await supabase
      .from('user_story')
      .select('user_story_id, story_text, difficulty_level, activity_type, catalog:activity_type(quiz_name)')
      .in('user_story_id', extraUserStoryIds ?? []);

    if (extraStoryRowsError) return compositionFailure(extraStoryRowsError);

    extraUserStories = ((extraStoryRows ?? []) as unknown as ExtraUserStoryRow[]).map((row) => ({
      userStoryId: row.user_story_id,
      storyText: row.story_text,
      level: row.difficulty_level as 1 | 2 | 3,
      catalogActivityType: row.activity_type,
      catalogName: row.catalog?.quiz_name ?? row.activity_type,
    }));
  }

  // The exact same union-and-dedupe formula loadCatalogQuestionPool uses for a real draw: the
  // catalog-derived set minus exclusions, plus hand-picked questions, deduplicated by
  // question_id — a question reachable both ways (linked catalog, not excluded, and also
  // hand-picked) must not double-count toward "available".
  const catalogActiveQuestions = questions.filter((q) => !excludedQuestionSet.has(q.question_id));
  const activeQuestionIds = new Set(catalogActiveQuestions.map((q) => q.question_id));
  const combinedForCoverage: { difficulty_level: number }[] = [...catalogActiveQuestions];
  for (const extra of extraQuestions) {
    if (!activeQuestionIds.has(extra.questionId)) {
      activeQuestionIds.add(extra.questionId);
      combinedForCoverage.push({ difficulty_level: extra.level });
    }
  }

  // Same formula, user_story side (a separate id namespace from question, so no cross-dedup
  // needed between the two): catalog-derived minus this quiz's own exclusions, plus hand-picked
  // prompts, deduplicated by user_story_id.
  const catalogActiveUserStories = userStories.filter((s) => !excludedUserStorySet.has(s.user_story_id));
  const activeUserStoryIds = new Set(catalogActiveUserStories.map((s) => s.user_story_id));
  combinedForCoverage.push(...catalogActiveUserStories);
  for (const extra of extraUserStories) {
    if (!activeUserStoryIds.has(extra.userStoryId)) {
      activeUserStoryIds.add(extra.userStoryId);
      combinedForCoverage.push({ difficulty_level: extra.level });
    }
  }

  const levelCoverage = buildLevelCoverage(combinedForCoverage, questionsPerLevel);

  return {
    catalogs,
    levelCoverage,
    extraQuestions,
    extraUserStories,
    activeCatalogQuestionIds: catalogActiveQuestions.map((q) => q.question_id),
    activeCatalogUserStoryIds: catalogActiveUserStories.map((s) => s.user_story_id),
    error: null,
  };
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

export type QuizScopedUserStory = CatalogUserStory & { excludedForQuiz: boolean };

/**
 * One linked catalog's prompts, annotated per-prompt with whether *this quiz* currently excludes
 * it — the llm-graded counterpart of listQuizCatalogQuestions, same "copy of the catalog, in the
 * context of this quiz" role. Delegates the actual prompt read to lib/activityTypeQueries.ts's
 * listCatalogUserStories so the two views (this one and the real catalog's own detail page) can
 * never disagree about what a catalog's prompts look like.
 */
export async function listQuizCatalogUserStories(supabase: SupabaseClient, quizId: string, activityType: string) {
  const { userStories, error: userStoriesError } = await listCatalogUserStories(supabase, activityType);
  if (userStoriesError || !userStories) return { userStories: null, error: userStoriesError };

  const { excludedIds, error: excludedError } = await listQuizExcludedUserStoryIds(supabase, quizId);
  if (excludedError) return { userStories: null, error: excludedError };

  const excludedSet = new Set(excludedIds ?? []);
  const scoped: QuizScopedUserStory[] = userStories.map((story) => ({ ...story, excludedForQuiz: excludedSet.has(story.id) }));

  return { userStories: scoped, error: null };
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
 * The live pool an assembled quiz would draw from at one difficulty level (GitHub #360/#361,
 * extended by GitHub #380): (every question across every one of its linked catalogs at that
 * level, minus this quiz's own exclusions) UNION (this quiz's individually hand-picked questions
 * at that level), deduplicated by question_id. Dynamic, not materialized at quiz-creation time —
 * an instructor editing a linked catalog's questions, excluding one, or hand-picking one,
 * afterward is reflected immediately, the same "always current" property
 * GET /api/instructor/quizzes/{activityType} (GitHub #359) has for browsing a single catalog.
 *
 * Conflict rule when a question is both excluded AND hand-picked for the same quiz: hand-picking
 * wins, and it isn't a tie-break so much as a consequence of the two lists' actual jobs —
 * exclusion only ever subtracts from the *catalog-derived* set (`excludedQuestionIds` is applied
 * to `data` above, never to the extra-question fetch below), so a hand-picked question is never
 * even a candidate for exclusion to begin with. This mirrors assembled_quiz_extra_question's own
 * header comment in supabase/schema.sql. The UI (AddQuizQuestionsModal) doesn't block picking an
 * already-excluded question — that combination is exactly how an instructor would deliberately
 * override one catalog exclusion for this quiz without re-including it catalog-wide, not an
 * accident to prevent.
 *
 * The second query only runs when `extraQuestionIds` is non-empty — a quiz with nothing
 * hand-picked costs nothing beyond the original single query.
 */
export async function loadCatalogQuestionPool(
  supabase: SupabaseClient,
  catalogActivityTypes: string[],
  difficultyLevel: number,
  excludedQuestionIds: readonly string[] = [],
  extraQuestionIds: readonly string[] = [],
): Promise<{ pool: CatalogQuestionPoolRow[] | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('question')
    .select('question_id, max_score, activity_type')
    .in('activity_type', catalogActivityTypes)
    .eq('difficulty_level', difficultyLevel);

  if (error) return { pool: null, error };

  const excludedSet = new Set(excludedQuestionIds);
  const catalogDerived = ((data ?? []) as CatalogQuestionPoolRow[]).filter((question) => !excludedSet.has(question.question_id));

  if (extraQuestionIds.length === 0) return { pool: catalogDerived, error: null };

  const { data: extraData, error: extraError } = await supabase
    .from('question')
    .select('question_id, max_score, activity_type')
    .in('question_id', extraQuestionIds)
    .eq('difficulty_level', difficultyLevel);

  if (extraError) return { pool: null, error: extraError };

  const seenIds = new Set(catalogDerived.map((question) => question.question_id));
  const pool = [...catalogDerived];
  for (const question of (extraData ?? []) as CatalogQuestionPoolRow[]) {
    if (!seenIds.has(question.question_id)) {
      seenIds.add(question.question_id);
      pool.push(question);
    }
  }

  return { pool, error: null };
}

export type PickableQuestion = {
  id: string;
  questionText: string;
  level: 1 | 2 | 3;
  catalogActivityType: string;
  catalogName: string;
};

/**
 * Every MCQ question the calling instructor created, any of their own catalogs — the pool the
 * "Add individual questions" picker (GitHub #380, AddQuizQuestionsModal) searches/filters
 * client-side, the same "fetch the full list once, filter in the browser" choice
 * GET /api/instructor/quizzes already makes for browsing catalogs. Scoped by creator_id the same
 * "mine only" way that route's own listQuizzesWithAuthorAndCount is (GitHub #.. follow-up) — a
 * colleague's or a built-in catalog's questions aren't this instructor's to hand-pick, matching
 * GET /api/instructor/questions' existing `.eq('user_id', ...)` scoping. Not quiz-scoped otherwise:
 * which of these are already in a given quiz is computed by the caller from that quiz's own
 * composition (linked-catalog-active-questions + extraQuestions, both already in hand from
 * loadQuizDetail) rather than asked of this query, so the same fetched list can back the picker
 * for any quiz without re-fetching per quiz.
 *
 * llm-graded catalogs never appear here structurally, without needing a grading_kind filter:
 * their prompts live in `user_story`, not `question`, so a catalog with no MCQ questions simply
 * contributes no rows.
 */
export async function listAllQuestionsForPicker(supabase: SupabaseClient, instructorId: string) {
  const { data, error } = await supabase
    .from('question')
    .select('question_id, question_prompt, difficulty_level, activity_type, catalog:activity_type(quiz_name)')
    .eq('user_id', instructorId)
    .order('question_prompt', { ascending: true });

  if (error) return { questions: null, error };

  const questions: PickableQuestion[] = ((data ?? []) as unknown as ExtraQuestionRow[]).map((row) => ({
    id: row.question_id,
    questionText: row.question_prompt,
    level: row.difficulty_level as 1 | 2 | 3,
    catalogActivityType: row.activity_type,
    catalogName: row.catalog?.quiz_name ?? row.activity_type,
  }));

  return { questions, error: null };
}

export type PickableUserStory = {
  id: string;
  storyText: string;
  level: 1 | 2 | 3;
  catalogActivityType: string;
  catalogName: string;
};

/**
 * Every llm-graded prompt the calling instructor created, any of their own catalogs — the
 * user_story counterpart of listAllQuestionsForPicker, same "mine only" scoping (creator_id, not
 * user_id — user_story's owner column is named differently, see listCatalogUserStories) and same
 * "fetch once, filter client-side" shape. mcq catalogs never appear here structurally: their
 * questions live in `question`, not `user_story`, so a catalog with no prompts simply contributes
 * no rows.
 */
export async function listAllUserStoriesForPicker(supabase: SupabaseClient, instructorId: string) {
  const { data, error } = await supabase
    .from('user_story')
    .select('user_story_id, story_text, difficulty_level, activity_type, catalog:activity_type(quiz_name)')
    .eq('creator_id', instructorId)
    .order('story_text', { ascending: true });

  if (error) return { userStories: null, error };

  const userStories: PickableUserStory[] = ((data ?? []) as unknown as ExtraUserStoryRow[]).map((row) => ({
    id: row.user_story_id,
    storyText: row.story_text,
    level: row.difficulty_level as 1 | 2 | 3,
    catalogActivityType: row.activity_type,
    catalogName: row.catalog?.quiz_name ?? row.activity_type,
  }));

  return { userStories, error: null };
}

/**
 * GitHub #362: copies every assembled_quiz belonging to `sourceCourseId` onto `targetCourseId` —
 * same quiz_name/description/questions_per_level (GitHub #416), the same linked catalogs
 * (assembled_quiz_catalog), the same per-quiz question exclusions (quiz_excluded_question) and
 * hand-picked questions
 * (assembled_quiz_extra_question, GitHub #380), and the same llm-graded prompt exclusions/
 * hand-picks (quiz_excluded_user_story/assembled_quiz_extra_user_story), all re-pointed at freshly
 * generated assembled_quiz ids. Reuses createAssembledQuiz rather than inserting assembled_quiz/
 * assembled_quiz_catalog by hand, so a link-insert failure for one copied quiz already self-cleans
 * (see that function's own docblock) — the caller only has to roll back the quizzes that *did*
 * fully insert, which the route above does by deleting the new course itself: fk_assembled_quiz_course
 * cascades, taking every assembled_quiz/assembled_quiz_catalog/quiz_excluded_question/
 * assembled_quiz_extra_question/quiz_excluded_user_story/assembled_quiz_extra_user_story row this
 * function has written so far with it.
 *
 * Deliberately never touches student_course, session_log, or any attempt/score table — those
 * aren't reachable from a course anywhere in this schema (see CLAUDE.md's Courses section), so
 * there is nothing here that could carry enrollment or history into the copy even by accident.
 */
export async function duplicateQuizzesForCourse(
  supabase: SupabaseClient,
  params: { sourceCourseId: string; targetCourseId: string; creatorId: string },
): Promise<{ copiedCount: number; error: { message: string } | null }> {
  const { data, error: sourceError } = await supabase
    .from('assembled_quiz')
    .select('assembled_quiz_id, quiz_name, description, grading_kind, questions_per_level')
    .eq('course_id', params.sourceCourseId);

  if (sourceError) return { copiedCount: 0, error: sourceError };

  type SourceQuizRow = {
    assembled_quiz_id: string;
    quiz_name: string;
    description: string | null;
    grading_kind: string;
    questions_per_level: number;
  };
  const sourceQuizzes = (data ?? []) as SourceQuizRow[];
  let copiedCount = 0;

  for (const sourceQuiz of sourceQuizzes) {
    const { activityTypes, error: catalogError } = await listQuizCatalogActivityTypes(supabase, sourceQuiz.assembled_quiz_id);
    if (catalogError) return { copiedCount, error: catalogError };

    const { excludedIds, error: excludedError } = await listQuizExcludedQuestionIds(supabase, sourceQuiz.assembled_quiz_id);
    if (excludedError) return { copiedCount, error: excludedError };

    const { extraIds, error: extraIdsError } = await listQuizExtraQuestionIds(supabase, sourceQuiz.assembled_quiz_id);
    if (extraIdsError) return { copiedCount, error: extraIdsError };

    const { excludedIds: excludedUserStoryIds, error: excludedUserStoryError } = await listQuizExcludedUserStoryIds(supabase, sourceQuiz.assembled_quiz_id);
    if (excludedUserStoryError) return { copiedCount, error: excludedUserStoryError };

    const { extraIds: extraUserStoryIds, error: extraUserStoryIdsError } = await listQuizExtraUserStoryIds(supabase, sourceQuiz.assembled_quiz_id);
    if (extraUserStoryIdsError) return { copiedCount, error: extraUserStoryIdsError };

    const { quiz: newQuiz, error: createError } = await createAssembledQuiz(supabase, {
      name: sourceQuiz.quiz_name,
      description: sourceQuiz.description,
      courseId: params.targetCourseId,
      creatorId: params.creatorId,
      gradingKind: sourceQuiz.grading_kind === 'llm-graded' ? 'llm-graded' : 'mcq',
      questionsPerLevel: sourceQuiz.questions_per_level,
      catalogActivityTypes: activityTypes ?? [],
    });
    if (createError || !newQuiz) return { copiedCount, error: createError };

    if ((excludedIds ?? []).length > 0) {
      const { error: exclusionsError } = await supabase.from('quiz_excluded_question').insert(
        (excludedIds ?? []).map((questionId) => ({ assembled_quiz_id: newQuiz.id, question_id: questionId })),
      );
      if (exclusionsError) return { copiedCount, error: exclusionsError };
    }

    if ((extraIds ?? []).length > 0) {
      const { error: extraError } = await supabase.from('assembled_quiz_extra_question').insert(
        (extraIds ?? []).map((questionId) => ({ assembled_quiz_id: newQuiz.id, question_id: questionId })),
      );
      if (extraError) return { copiedCount, error: extraError };
    }

    if ((excludedUserStoryIds ?? []).length > 0) {
      const { error: exclusionsError } = await supabase.from('quiz_excluded_user_story').insert(
        (excludedUserStoryIds ?? []).map((userStoryId) => ({ assembled_quiz_id: newQuiz.id, user_story_id: userStoryId })),
      );
      if (exclusionsError) return { copiedCount, error: exclusionsError };
    }

    if ((extraUserStoryIds ?? []).length > 0) {
      const { error: extraError } = await supabase.from('assembled_quiz_extra_user_story').insert(
        (extraUserStoryIds ?? []).map((userStoryId) => ({ assembled_quiz_id: newQuiz.id, user_story_id: userStoryId })),
      );
      if (extraError) return { copiedCount, error: extraError };
    }

    copiedCount++;
  }

  return { copiedCount, error: null };
}
