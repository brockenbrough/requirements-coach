import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import { findOwnedCourse } from '../../../../lib/courseQueries';
import { createAssembledQuiz, listAssembledQuizzesForInstructor } from '../../../../lib/assembledQuizQueries';
import { isGradingKind } from '../../../../lib/activityTypes';
import { hasLlmConfig } from '../../../../lib/instructorLlmConfigQueries';
import { MIN_QUESTIONS_PER_LEVEL, QUESTIONS_PER_SESSION } from '../../../../lib/sessionRules';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/assembled-quizzes — every assembled quiz the calling instructor created
 * (GitHub #360), newest first. Scoped to the caller, unlike GET /api/instructor/quizzes
 * (catalogs, GitHub #347, globally shared): an assembled quiz is built for one of the caller's
 * own courses, and courses aren't shared between instructors either.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor (no body)
 * - 200 { quizzes: [{ id, name, description, courseId, courseName, gradingKind, catalogNames, createdAt }] }
 * - 500 Supabase not configured, or the query fails
 */
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json(
          { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
          { status: guard.status },
        );
  }

  const { quizzes, error } = await listAssembledQuizzesForInstructor(supabase, guard.user_id);
  if (error || !quizzes) {
    return Response.json({ error: error?.message ?? 'Could not load quizzes.' }, { status: 500 });
  }

  return Response.json({ quizzes }, { status: 200 });
}

/**
 * POST /api/instructor/assembled-quizzes — composes a quiz from one or more question catalogs
 * for one of the caller's own courses (GitHub #360).
 *
 * Body: { name, description?, courseId, gradingKind, questionsPerLevel?, catalogActivityTypes: string[] }
 * - name required, non-blank
 * - courseId must name a course the caller owns — findOwnedCourse's same 404-then-403 ordering
 *   GET/PATCH/DELETE /api/instructor/courses/{id} already use (GitHub #241), checked before the
 *   catalog list so an instructor probing someone else's course id learns nothing about catalogs.
 * - gradingKind is required and locked forever once set (assembled_quiz.grading_kind, mirroring
 *   activity_type.grading_kind's own "decided at creation, never edited" rule) — it is what lets
 *   the composition page's "Create new question"/"Add prompt" always know which one to offer.
 * - questionsPerLevel (GitHub #416) is optional — omitting it (or the "Create Quiz" modal's own
 *   default) falls back to QUESTIONS_PER_SESSION, so a plain create behaves exactly as before this
 *   field existed. When present it must be a whole number of at least MIN_QUESTIONS_PER_LEVEL (4)
 *   — every quiz must have at least this many questions per level, enforced again by the DB's own
 *   CHECK constraint; it becomes the draw size POST /api/sessions uses for any catalog this quiz
 *   grants access to (see assembled_quiz.questions_per_level's own comment in supabase/schema.sql).
 * - catalogActivityTypes must have at least one entry, and every entry must be a real catalog
 *   (activity_type row) whose own grading_kind matches the submitted gradingKind — checked with
 *   one bulk query rather than N.
 *
 * GitHub #520: an 'llm-graded' quiz also requires the caller to already have a saved
 * instructor_llm_config row (hasLlmConfig, lib/instructorLlmConfigQueries.ts) — same gate as
 * POST /api/activities/types and the catalog-duplicate route, applied here too since this is the
 * other place an instructor can end up owning something that promises LLM grading. Checked right
 * after gradingKind validation, before any course/catalog lookup. Not checked for 'mcq'.
 *
 * Returns 201 with { quiz: { id, name, description, courseId, gradingKind, questionsPerLevel } }.
 */
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json(
          { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
          { status: guard.status },
        );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { name, description, courseId, gradingKind, questionsPerLevel, catalogActivityTypes } = (body ?? {}) as {
    name?: unknown;
    description?: unknown;
    courseId?: unknown;
    gradingKind?: unknown;
    questionsPerLevel?: unknown;
    catalogActivityTypes?: unknown;
  };

  if (typeof name !== 'string' || name.trim() === '') {
    return Response.json({ error: 'name is required.' }, { status: 400 });
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return Response.json({ error: 'description must be a string.' }, { status: 400 });
  }
  if (typeof courseId !== 'string' || courseId.trim() === '') {
    return Response.json({ error: 'courseId is required.' }, { status: 400 });
  }
  if (!isGradingKind(gradingKind)) {
    return Response.json({ error: 'gradingKind must be "mcq" or "llm-graded".' }, { status: 400 });
  }
  if (gradingKind === 'llm-graded') {
    const { hasConfig, error: configError } = await hasLlmConfig(supabase, guard.user_id);
    if (configError) return Response.json({ error: configError.message }, { status: 500 });
    if (!hasConfig) {
      return Response.json(
        { error: 'Configure an LLM provider in Settings before creating an LLM-graded quiz.' },
        { status: 400 },
      );
    }
  }
  if (
    questionsPerLevel !== undefined &&
    (typeof questionsPerLevel !== 'number' || !Number.isInteger(questionsPerLevel) || questionsPerLevel < MIN_QUESTIONS_PER_LEVEL)
  ) {
    return Response.json(
      { error: `questionsPerLevel must be a whole number of at least ${MIN_QUESTIONS_PER_LEVEL}.` },
      { status: 400 },
    );
  }
  if (!Array.isArray(catalogActivityTypes) || catalogActivityTypes.length === 0) {
    return Response.json({ error: 'At least one catalog must be selected.' }, { status: 400 });
  }
  if (!catalogActivityTypes.every((value): value is string => typeof value === 'string' && value.trim() !== '')) {
    return Response.json({ error: 'catalogActivityTypes must be an array of non-empty strings.' }, { status: 400 });
  }

  const found = await findOwnedCourse(supabase, courseId, guard.user_id);
  if (found.status === 'error') return Response.json({ error: found.error.message }, { status: 500 });
  if (found.status === 'not_found') return Response.json({ error: 'Course not found.' }, { status: 404 });
  if (found.status === 'forbidden') return new Response(null, { status: 403 });

  const uniqueCatalogIds = Array.from(new Set(catalogActivityTypes));

  const { data: validCatalogs, error: catalogError } = await supabase
    .from('activity_type')
    .select('activity_type, grading_kind')
    .in('activity_type', uniqueCatalogIds);

  if (catalogError) return Response.json({ error: catalogError.message }, { status: 500 });

  const catalogRows = (validCatalogs ?? []) as { activity_type: string; grading_kind: string }[];
  const validIds = new Set(catalogRows.map((row) => row.activity_type));
  if (uniqueCatalogIds.some((id) => !validIds.has(id))) {
    return Response.json({ error: 'One or more catalogs do not exist.' }, { status: 400 });
  }
  if (catalogRows.some((row) => row.grading_kind !== gradingKind)) {
    return Response.json({ error: 'All selected catalogs must match the quiz\'s activity type.' }, { status: 400 });
  }

  const trimmedDescription = typeof description === 'string' && description.trim() !== '' ? description.trim() : null;

  const { quiz, error } = await createAssembledQuiz(supabase, {
    name: name.trim(),
    description: trimmedDescription,
    courseId,
    creatorId: guard.user_id,
    gradingKind,
    questionsPerLevel: (questionsPerLevel as number | undefined) ?? QUESTIONS_PER_SESSION,
    catalogActivityTypes: uniqueCatalogIds,
  });

  if (error || !quiz) {
    return Response.json({ error: error?.message ?? 'Could not create quiz.' }, { status: 500 });
  }

  return Response.json({ quiz }, { status: 201 });
}
