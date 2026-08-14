// GitHub #360: queries backing "compose a quiz from one or more catalogs, scoped to a course" —
// a deliberately separate concept from activity_type ("Question Catalog", GitHub #347/#359,
// still internally called "quiz" in code); see CLAUDE.md for why the two aren't merged.

import type { SupabaseClient } from './sessionQueries';
import { shuffleArray } from './shuffleArray';

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

/**
 * Picks up to `count` items at random from `pool` — pure, no I/O, so it's trivially testable for
 * pool size and "no duplicates within one draw" without a database. Fisher-Yates
 * (lib/shuffleArray.ts), not a sort comparator, for the same reason app/api/sessions/route.ts's
 * own draw avoids one; `pool` is never mutated. Returns fewer than `count` if the pool itself is
 * smaller — the caller decides whether that's an error (app/api/sessions/route.ts's AC 5 does for
 * a single-catalog Type A activity); no route calls this one yet, since #360's scope is composing
 * a quiz, not yet starting a student attempt against one.
 */
export function pickRandomQuestions<T>(pool: readonly T[], count: number): T[] {
  return shuffleArray(pool as T[]).slice(0, count);
}

export type CatalogQuestionPoolRow = { question_id: string; max_score: number | null; activity_type: string };

/**
 * The live pool an assembled quiz would draw from at one difficulty level: every question across
 * every one of its linked catalogs at that level. Dynamic, not materialized at quiz-creation time
 * — an instructor editing a linked catalog's questions afterward is reflected immediately, the
 * same "always current" property GET /api/instructor/quizzes/{activityType} (GitHub #359) has for
 * browsing a single catalog.
 */
export async function loadCatalogQuestionPool(
  supabase: SupabaseClient,
  catalogActivityTypes: string[],
  difficultyLevel: number,
): Promise<{ pool: CatalogQuestionPoolRow[] | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('question')
    .select('question_id, max_score, activity_type')
    .in('activity_type', catalogActivityTypes)
    .eq('difficulty_level', difficultyLevel);

  if (error) return { pool: null, error };
  return { pool: (data ?? []) as CatalogQuestionPoolRow[], error: null };
}
