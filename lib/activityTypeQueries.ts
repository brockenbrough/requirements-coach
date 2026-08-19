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
  /** GitHub #478: true for one of the three seeded example catalogs (creator_id IS NULL) — the
   *  same test authorNameOf already uses to say "Built-in", surfaced as its own boolean so callers
   *  don't have to string-match authorName to decide whether to lock the UI down. */
  isBuiltIn: boolean;
};

type QuizRow = {
  activity_type: string;
  quiz_name: string;
  description: string | null;
  grading_kind: string;
  rating_prompt: string | null;
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
 * Every quiz this instructor created — creator_id = instructorId, strictly — with its author,
 * question count, and how many assembled quizzes currently reference it, for the instructor-facing
 * browse page. Same "mine only" convention listOwnedActivityTypes documents below: a built-in
 * catalog (creator_id IS NULL) never matches, and neither does a colleague's.
 *
 * One query, using the same creator:creator_id(...) + related-table (count) embed pattern
 * lib/courseQueries.ts's listJoinableCourses uses for professor_name/student_count, extended with
 * a second count embed onto assembled_quiz_catalog (the m:n link table from GitHub #360) — author
 * name, question count, and usage count come back on the same row as the quiz itself rather than
 * three round trips merged in JS. The creator embed is what it is (always the caller once scoped)
 * but stays in the select so the response shape doesn't need to special-case authorName.
 *
 * GitHub #379: user_story(count) rides along the same way question(count) does — that embed is
 * what fk_user_story_activity_type was added for — and grading_kind decides which of the two
 * counts becomes questionCount. Both are fetched unconditionally because it is one query either
 * way; the unused one is always 0, since a catalog only ever fills one pool.
 */
function buildQuizSummary(row: QuizRow): QuizSummary {
  const gradingKind = gradingKindOf(row);

  return {
    activityType: row.activity_type,
    name: row.quiz_name,
    description: row.description,
    authorName: authorNameOf(row),
    gradingKind,
    questionCount: itemCountOf(row, gradingKind),
    quizCount: row.assembled_quiz_catalog?.[0]?.count ?? 0,
    isBuiltIn: row.creator_id === null,
  };
}

const QUIZ_SUMMARY_SELECT =
  'activity_type, quiz_name, description, grading_kind, creator_id, creator:creator_id(first_name, last_name, username), question(count), user_story(count), assembled_quiz_catalog(count)';

export async function listQuizzesWithAuthorAndCount(supabase: SupabaseClient, instructorId: string) {
  const { data, error } = await supabase
    .from('activity_type')
    .select(QUIZ_SUMMARY_SELECT)
    .eq('creator_id', instructorId)
    // GitHub #525: a soft-deleted catalog no longer belongs on the browse page.
    .is('deleted_at', null)
    .order('quiz_name', { ascending: true });

  if (error) return { quizzes: null, error };

  const quizzes: QuizSummary[] = ((data ?? []) as unknown as QuizRow[]).map(buildQuizSummary);
  return { quizzes, error: null };
}

/**
 * GitHub #478: the three seeded, ownerless catalogs (creator_id IS NULL) every instructor sees as
 * "Example Catalogs" — the opposite scope from listQuizzesWithAuthorAndCount's "mine only" list,
 * queried with the same row shape so the browse page can render both lists through one QuizSummary
 * type. Not restricted to exactly three rows — any catalog with no creator counts, so this stays
 * correct if a future migration seeds more.
 */
export async function listExampleCatalogsWithCount(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('activity_type')
    .select(QUIZ_SUMMARY_SELECT)
    .is('creator_id', null)
    // GitHub #525: a soft-deleted catalog no longer belongs on the browse page.
    .is('deleted_at', null)
    .order('quiz_name', { ascending: true });

  if (error) return { quizzes: null, error };

  const quizzes: QuizSummary[] = ((data ?? []) as unknown as QuizRow[]).map(buildQuizSummary);
  return { quizzes, error: null };
}

export type QuizMeta = Omit<QuizSummary, 'questionCount' | 'quizCount'> & {
  /** GitHub #379 follow-up: the catalog's own custom grading rubric — see the header comment on
   *  activity_type.rating_prompt in supabase/schema.sql. Only ever meaningful for an llm-graded
   *  catalog; null for mcq (and for any llm-graded catalog that hasn't set one). */
  ratingPrompt: string | null;
};

/**
 * GitHub #359: one catalog's own metadata (name/description/author), for the catalog detail page
 * — the single-row counterpart to listQuizzesWithAuthorAndCount's list. Returns { quiz: null }
 * (not an error) when activityType matches no row, so the route can turn that into a 404.
 *
 * Deliberately unscoped by creator, unlike listQuizzesWithAuthorAndCount above: this is shared by
 * three routes with three different authorization rules — the direct catalog detail route (which
 * enforces "mine only" itself, by comparing the returned creatorId against the caller), the
 * assembled-quiz "catalog in the context of this quiz" view (authorized via quiz ownership, not
 * catalog ownership — a linked built-in or another-instructor's catalog must stay viewable there),
 * and the student-facing single-activity route (authorized via course enrollment). creatorId rides
 * along as a sibling field, not folded into QuizMeta, precisely so the two callers that don't need
 * it can keep destructuring only `quiz` without it ever reaching a JSON response by accident.
 *
 * GitHub #525: excludes a soft-deleted catalog — every one of its three callers treats a miss here
 * as "doesn't exist" (404, or a fallback to a different resolution path), which is exactly the
 * right behavior for a deleted catalog too. This is also what makes the duplicate route
 * (app/api/instructor/quizzes/[activityType]/duplicate/route.ts) automatically 404 on a deleted
 * source, with no separate check needed in duplicateCatalog itself.
 */
export async function getQuizByActivityType(supabase: SupabaseClient, activityType: string) {
  const { data, error } = await supabase
    .from('activity_type')
    .select(
      'activity_type, quiz_name, description, grading_kind, rating_prompt, creator_id, creator:creator_id(first_name, last_name, username)',
    )
    .eq('activity_type', activityType)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { quiz: null, creatorId: null, error };
  if (!data) return { quiz: null, creatorId: null, error: null };

  const row = data as unknown as QuizRow;

  const quiz: QuizMeta = {
    activityType: row.activity_type,
    name: row.quiz_name,
    description: row.description,
    authorName: authorNameOf(row),
    gradingKind: gradingKindOf(row),
    ratingPrompt: row.rating_prompt,
    isBuiltIn: row.creator_id === null,
  };

  return { quiz, creatorId: row.creator_id, error: null };
}

/**
 * GitHub #379 follow-up: updates a catalog's own grading rubric (activity_type.rating_prompt) —
 * the write behind PATCH /api/instructor/quizzes/{activityType}. Returns the saved value (not the
 * whole row) since that's all the route needs to hand back.
 */
export async function updateCatalogRatingPrompt(supabase: SupabaseClient, activityType: string, ratingPrompt: string) {
  const { data, error } = await supabase
    .from('activity_type')
    .update({ rating_prompt: ratingPrompt })
    .eq('activity_type', activityType)
    .select('rating_prompt')
    .maybeSingle();

  if (error) return { ratingPrompt: null, error };
  return { ratingPrompt: (data as { rating_prompt: string } | null)?.rating_prompt ?? null, error: null };
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

/** One assembled quiz that still composes a catalog someone is trying to delete. */
export type LinkedQuizSummary = { quizId: string; quizName: string; courseName: string };

type QuizLinkRow = {
  assembled_quiz: { assembled_quiz_id: string; quiz_name: string; course: { course_name: string } | null } | null;
};

export type DeleteCatalogResult =
  | { status: 'ok' }
  | { status: 'linked'; quizzes: LinkedQuizSummary[] }
  | { status: 'error'; error: { message: string } };

/**
 * Soft-deletes a catalog (GitHub #525): sets activity_type.deleted_at rather than removing
 * anything. The row itself, and every question/answer/user_story/title_definition that references
 * it, stays exactly as it is — a student's history against this catalog is never touched, so it
 * keeps reading correctly everywhere it's shown (completed-attempts lists, the instructor
 * dashboard, per-student detail, class statistics). isActivityType/getGradingKind
 * (lib/activityTypes.ts) exclude a soft-deleted catalog by default, which is what makes it stop
 * being selectable, playable, or editable going forward without needing any cascading delete at
 * all.
 *
 * This used to hard-block ('in_use') the instant any student had ever engaged with the catalog —
 * removed entirely per the product decision that historical attempts must never prevent deletion.
 *
 * Still refuses with 'linked' if any assembled_quiz_catalog row references this catalog — the one
 * precondition that remains. A catalog can be composed into several quizzes/courses at once (see
 * CLAUDE.md's Assembled quizzes section), so silently unlinking it here on delete could quietly
 * break a running course out from under students; the instructor removes it from each quiz by hand
 * first (DELETE /api/instructor/assembled-quizzes/{quizId}/catalogs/{activityType}, the existing
 * "remove a catalog from a quiz" action). This also guarantees a deletable catalog is already
 * unreachable through any course/discovery/composition query before this even runs, since those
 * all derive from assembled_quiz_catalog.
 */
export async function deleteCatalog(supabase: SupabaseClient, activityType: string): Promise<DeleteCatalogResult> {
  const { data: quizLinkRows, error: quizLinkError } = await supabase
    .from('assembled_quiz_catalog')
    .select('assembled_quiz:assembled_quiz_id(assembled_quiz_id, quiz_name, course:course_id(course_name))')
    .eq('activity_type', activityType);
  if (quizLinkError) return { status: 'error', error: quizLinkError };

  const linkedQuizzes: LinkedQuizSummary[] = ((quizLinkRows ?? []) as unknown as QuizLinkRow[])
    .map((row) => row.assembled_quiz)
    .filter((quiz): quiz is NonNullable<QuizLinkRow['assembled_quiz']> => quiz !== null)
    .map((quiz) => ({
      quizId: quiz.assembled_quiz_id,
      quizName: quiz.quiz_name,
      courseName: quiz.course?.course_name ?? 'Unknown course',
    }));
  if (linkedQuizzes.length > 0) return { status: 'linked', quizzes: linkedQuizzes };

  const { error: deleteError } = await supabase
    .from('activity_type')
    .update({ deleted_at: new Date().toISOString() })
    .eq('activity_type', activityType);
  if (deleteError) return { status: 'error', error: deleteError };

  return { status: 'ok' };
}

export type CatalogEditableCheck = { ok: true } | { ok: false; response: Response };

/**
 * GitHub #478: refuses to let new content be filed under a built-in example catalog (creator_id
 * IS NULL). Individual question/prompt edit and delete routes already refuse a seeded, ownerless
 * row by construction — no instructor's user_id ever equals NULL — but *creating* a new question
 * or prompt under an existing catalog key was never scoped to that catalog's own ownership at all,
 * so a built-in catalog could otherwise quietly grow content that was never part of the shipped
 * example, defeating the "the original example is untouched" guarantee the Duplicate action
 * depends on.
 *
 * An unknown activityType is let through here (`data` comes back null) rather than surfaced as a
 * second error — the caller's own validation (isActivityType/getGradingKind) already 400s that
 * case before this runs. GitHub #525: excludes a soft-deleted catalog for the same reason — its
 * content can't be edited once deleted, though in practice the caller's own isActivityType/
 * getGradingKind check already 400s first, making this a defense-in-depth duplicate.
 */
export async function assertCatalogIsEditable(supabase: SupabaseClient, activityType: string): Promise<CatalogEditableCheck> {
  const { data, error } = await supabase
    .from('activity_type')
    .select('creator_id')
    .eq('activity_type', activityType)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { ok: false, response: Response.json({ error: error.message }, { status: 500 }) };

  if (data && (data as { creator_id: string | null }).creator_id === null) {
    return {
      ok: false,
      response: Response.json(
        { error: 'This is a built-in example catalog and cannot be edited. Duplicate it to add your own questions or prompts.' },
        { status: 403 },
      ),
    };
  }

  return { ok: true };
}

export type DuplicateCatalogResult =
  | {
      status: 'ok';
      quiz: {
        activityType: string;
        name: string;
        description: string | null;
        gradingKind: GradingKind;
        ratingPrompt: string | null;
        questionCount: number;
      };
    }
  | { status: 'not_found' }
  | { status: 'name_conflict' }
  | { status: 'error'; error: { message: string } };

/**
 * GitHub #478: copies a catalog's own metadata plus every question/answer ('mcq') or user_story
 * ('llm-graded') it contains into a brand-new catalog owned by `creatorId` — the mechanism behind
 * an example catalog's "Duplicate" action. The source catalog is only ever read; nothing about it
 * is mutated, which is what keeps "the original example is untouched" true by construction rather
 * than by convention. Copied questions/prompts are attributed to `creatorId` (not left ownerless),
 * so the new catalog really is "a normal, fully editable catalog like any the instructor creates
 * themselves" — the copied rows pass the same `user_id`/`creator_id` ownership check every edit/
 * delete route already enforces.
 *
 * `newKey`/`newName` are assumed already validated (lib/activityTypes.ts's deriveActivityTypeKey)
 * — this function only handles the database side.
 *
 * Not transactional (same limitation every other multi-step write in this codebase accepts, since
 * the Supabase JS client offers no transaction). If any step after the activity_type insert fails,
 * everything inserted under `newKey` so far — including the activity_type row itself — is deleted.
 * That cleanup is always safe here (unlike deleteCatalog above, which must check student usage
 * first): `newKey` did not exist a moment ago, so nothing could have referenced it yet.
 */
export async function duplicateCatalog(
  supabase: SupabaseClient,
  params: { sourceActivityType: string; newKey: string; newName: string; creatorId: string },
): Promise<DuplicateCatalogResult> {
  const { sourceActivityType, newKey, newName, creatorId } = params;

  const { data: sourceRow, error: sourceError } = await supabase
    .from('activity_type')
    .select('description, grading_kind, rating_prompt')
    .eq('activity_type', sourceActivityType)
    .maybeSingle();

  if (sourceError) return { status: 'error', error: sourceError };
  if (!sourceRow) return { status: 'not_found' };

  const source = sourceRow as { description: string | null; grading_kind: string; rating_prompt: string | null };
  const gradingKind: GradingKind = isGradingKind(source.grading_kind) ? source.grading_kind : 'mcq';

  const { error: insertError } = await supabase.from('activity_type').insert({
    activity_type: newKey,
    quiz_name: newName,
    description: source.description,
    grading_kind: gradingKind,
    rating_prompt: source.rating_prompt,
    creator_id: creatorId,
  });

  if (insertError) {
    if ((insertError as { code?: string }).code === '23505') return { status: 'name_conflict' };
    return { status: 'error', error: insertError };
  }

  if (gradingKind === 'llm-graded') {
    const { data: storyRows, error: storyFetchError } = await supabase
      .from('user_story')
      .select('story_text, difficulty_level')
      .eq('activity_type', sourceActivityType);

    if (storyFetchError) {
      await supabase.from('activity_type').delete().eq('activity_type', newKey);
      return { status: 'error', error: storyFetchError };
    }

    const stories = (storyRows ?? []) as { story_text: string; difficulty_level: number }[];

    if (stories.length > 0) {
      const { error: storyInsertError } = await supabase.from('user_story').insert(
        stories.map((story) => ({
          user_story_id: crypto.randomUUID(),
          story_text: story.story_text,
          difficulty_level: story.difficulty_level,
          activity_type: newKey,
          creator_id: creatorId,
        })),
      );

      if (storyInsertError) {
        await supabase.from('user_story').delete().eq('activity_type', newKey);
        await supabase.from('activity_type').delete().eq('activity_type', newKey);
        return { status: 'error', error: storyInsertError };
      }
    }

    return {
      status: 'ok',
      quiz: {
        activityType: newKey,
        name: newName,
        description: source.description,
        gradingKind,
        ratingPrompt: source.rating_prompt,
        questionCount: stories.length,
      },
    };
  }

  type SourceQuestionRow = {
    question_prompt: string;
    difficulty_level: number;
    order_number: number;
    max_score: number | null;
    question_to_answer: { answer: { option_text: string; is_correct: boolean; explanation: string | null } | null }[];
  };

  const { data: questionRows, error: questionFetchError } = await supabase
    .from('question')
    .select(
      'question_prompt, difficulty_level, order_number, max_score, question_to_answer(answer:answer_id(option_text, is_correct, explanation))',
    )
    .eq('activity_type', sourceActivityType);

  if (questionFetchError) {
    await supabase.from('activity_type').delete().eq('activity_type', newKey);
    return { status: 'error', error: questionFetchError };
  }

  const sourceQuestions = (questionRows ?? []) as unknown as SourceQuestionRow[];

  const newQuestionRows: Record<string, unknown>[] = [];
  const newAnswerRows: Record<string, unknown>[] = [];
  const newLinkRows: Record<string, unknown>[] = [];

  for (const q of sourceQuestions) {
    const newQuestionId = crypto.randomUUID();
    newQuestionRows.push({
      question_id: newQuestionId,
      question_prompt: q.question_prompt,
      activity_type: newKey,
      difficulty_level: q.difficulty_level,
      order_number: q.order_number,
      max_score: q.max_score,
      user_id: creatorId,
    });

    for (const link of q.question_to_answer) {
      if (!link.answer) continue;
      const newAnswerId = crypto.randomUUID();
      newAnswerRows.push({
        answer_id: newAnswerId,
        option_text: link.answer.option_text,
        is_correct: link.answer.is_correct,
        explanation: link.answer.explanation,
      });
      newLinkRows.push({ question_id: newQuestionId, answer_id: newAnswerId });
    }
  }

  async function rollbackMcq() {
    const newQuestionIds = newQuestionRows.map((r) => r.question_id as string);
    const newAnswerIds = newAnswerRows.map((r) => r.answer_id as string);
    if (newQuestionIds.length > 0) await supabase.from('question_to_answer').delete().in('question_id', newQuestionIds);
    if (newAnswerIds.length > 0) await supabase.from('answer').delete().in('answer_id', newAnswerIds);
    if (newQuestionIds.length > 0) await supabase.from('question').delete().in('question_id', newQuestionIds);
    await supabase.from('activity_type').delete().eq('activity_type', newKey);
  }

  if (newQuestionRows.length > 0) {
    const { error: questionInsertError } = await supabase.from('question').insert(newQuestionRows);
    if (questionInsertError) {
      await supabase.from('activity_type').delete().eq('activity_type', newKey);
      return { status: 'error', error: questionInsertError };
    }

    if (newAnswerRows.length > 0) {
      const { error: answerInsertError } = await supabase.from('answer').insert(newAnswerRows);
      if (answerInsertError) {
        await rollbackMcq();
        return { status: 'error', error: answerInsertError };
      }

      const { error: linkInsertError } = await supabase.from('question_to_answer').insert(newLinkRows);
      if (linkInsertError) {
        await rollbackMcq();
        return { status: 'error', error: linkInsertError };
      }
    }
  }

  return {
    status: 'ok',
    quiz: {
      activityType: newKey,
      name: newName,
      description: source.description,
      gradingKind,
      ratingPrompt: source.rating_prompt,
      questionCount: newQuestionRows.length,
    },
  };
}
