import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import { findOwnedCourse } from '../../../../lib/courseQueries';
import { createAssembledQuiz, listAssembledQuizzesForInstructor } from '../../../../lib/assembledQuizQueries';

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
 * - 200 { quizzes: [{ id, name, description, courseId, courseName, catalogNames, createdAt }] }
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
 * Body: { name, description?, courseId, catalogActivityTypes: string[] }
 * - name required, non-blank
 * - courseId must name a course the caller owns — findOwnedCourse's same 404-then-403 ordering
 *   GET/PATCH/DELETE /api/instructor/courses/{id} already use (GitHub #241), checked before the
 *   catalog list so an instructor probing someone else's course id learns nothing about catalogs.
 * - catalogActivityTypes must have at least one entry, and every entry must be a real catalog
 *   (activity_type row) — checked with one bulk query rather than N.
 *
 * Returns 201 with { quiz: { id, name, description, courseId } }.
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

  const { name, description, courseId, catalogActivityTypes } = (body ?? {}) as {
    name?: unknown;
    description?: unknown;
    courseId?: unknown;
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
    .select('activity_type')
    .in('activity_type', uniqueCatalogIds);

  if (catalogError) return Response.json({ error: catalogError.message }, { status: 500 });

  const validIds = new Set(((validCatalogs ?? []) as { activity_type: string }[]).map((row) => row.activity_type));
  if (uniqueCatalogIds.some((id) => !validIds.has(id))) {
    return Response.json({ error: 'One or more catalogs do not exist.' }, { status: 400 });
  }

  const trimmedDescription = typeof description === 'string' && description.trim() !== '' ? description.trim() : null;

  const { quiz, error } = await createAssembledQuiz(supabase, {
    name: name.trim(),
    description: trimmedDescription,
    courseId,
    creatorId: guard.user_id,
    catalogActivityTypes: uniqueCatalogIds,
  });

  if (error || !quiz) {
    return Response.json({ error: error?.message ?? 'Could not create quiz.' }, { status: 500 });
  }

  return Response.json({ quiz }, { status: 201 });
}
