// The first and only writer for title_definition (REQ-GAM-BL-1). Until this module existed the
// table had no write path at all: instructors could create catalogs, but nothing could give those
// catalogs a title ladder, so every instructor-created catalog showed a bare "Level 1 / Level 2 /
// Level 3" and the profile page's title dropdown had nothing to offer.
//
// Reading titles stays where it was — lib/titleQueries.ts (computeStudentTitles,
// loadAvailableTitleLadders, canWearTitle). This file is deliberately the write side only, so the
// student-facing read path keeps working without knowing authoring exists.
//
// Nothing here grants a title to anybody. A title is earned by passing a level and is derived on
// read, so inserting a row here retroactively gives it to every student who already passed that
// level — no backfill, no award table, no completion hook.

import type { SupabaseClient } from './sessionQueries';
import type { TitleLadderRungInput } from './titleLadderInput';

/** One stored rung, in the shape the instructor UI renders and edits. */
export type StoredTitleRung = { difficultyLevel: number; titleName: string };

type TitleDefinitionRow = { difficulty_level: number; title_name: string };

/**
 * Every title currently defined for one catalog, level order. A catalog with no ladder yet returns
 * [] rather than placeholder rungs — the UI fills the gaps, the query doesn't invent them.
 */
export async function loadTitleLadder(
  supabase: SupabaseClient,
  activityType: string,
): Promise<{ rungs: StoredTitleRung[] | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('title_definition')
    .select('difficulty_level, title_name')
    .eq('activity_type', activityType)
    .order('difficulty_level');

  if (error) return { rungs: null, error };

  const rungs = ((data ?? []) as TitleDefinitionRow[]).map((row) => ({
    difficultyLevel: row.difficulty_level,
    titleName: row.title_name,
  }));

  return { rungs, error: null };
}

/**
 * Writes one catalog's ladder: rungs with a name are inserted or updated (see below), rungs
 * explicitly cleared (titleName null) are deleted. Levels absent from `rungs` are left exactly as
 * they are, so a caller can send a single rung without wiping the other two.
 *
 * Editing an existing rung must preserve its title_definition_id rather than replace the row,
 * because "user".selected_title_definition_id points at it — a student already wearing the title
 * would silently lose it (or, worse, the save itself would fail) otherwise.
 *
 * This used to be a single upsert keyed on uq_title_definition_activity_level, generating a fresh
 * title_definition_id for every row and relying on Postgres to "ignore it on conflict" — that
 * belief was wrong. `ON CONFLICT (activity_type, difficulty_level) DO UPDATE SET ...` puts every
 * column present in the payload into the SET clause except the conflict target itself, and
 * title_definition_id isn't part of that target, so it WAS being overwritten with the freshly
 * generated id on every save. That's an UPDATE to the primary key of a row "user" may already
 * reference, which fk_user_title_definition (ON DELETE SET NULL, but no ON UPDATE clause)
 * correctly rejects — "update or delete on table title_definition violates foreign key constraint
 * fk_user_title_definition" the moment any student had already selected that title. Splitting into
 * an explicit update (existing rows, id untouched) and insert (new rows, fresh id) avoids the
 * primary key ever moving for a row that already exists.
 */
export async function saveTitleLadder(
  supabase: SupabaseClient,
  activityType: string,
  rungs: TitleLadderRungInput[],
): Promise<{ error: { message: string } | null }> {
  const filled = rungs.filter((rung) => rung.titleName !== null);
  const cleared = rungs.filter((rung) => rung.titleName === null).map((rung) => rung.difficultyLevel);

  if (filled.length > 0) {
    const { data: existingData, error: existingError } = await supabase
      .from('title_definition')
      .select('title_definition_id, difficulty_level')
      .eq('activity_type', activityType)
      .in(
        'difficulty_level',
        filled.map((rung) => rung.difficultyLevel),
      );

    if (existingError) return { error: existingError };

    const existingIdByLevel = new Map(
      ((existingData ?? []) as { title_definition_id: string; difficulty_level: number }[]).map((row) => [
        row.difficulty_level,
        row.title_definition_id,
      ]),
    );

    const toInsert = filled.filter((rung) => !existingIdByLevel.has(rung.difficultyLevel));
    const toUpdate = filled.filter((rung) => existingIdByLevel.has(rung.difficultyLevel));

    if (toInsert.length > 0) {
      const { error } = await supabase.from('title_definition').insert(
        toInsert.map((rung) => ({
          title_definition_id: crypto.randomUUID(),
          activity_type: activityType,
          difficulty_level: rung.difficultyLevel,
          title_name: rung.titleName as string,
        })),
      );

      if (error) return { error };
    }

    // One statement per row rather than a batched call: supabase-js/PostgREST has no bulk-update-
    // by-differing-values primitive (that's what upsert is for, and upsert is exactly the thing
    // this function stopped using) — a handful of rows at most (MAX_DIFFICULTY_LEVEL is 3), so the
    // extra round trips are not a real cost.
    for (const rung of toUpdate) {
      const { error } = await supabase
        .from('title_definition')
        .update({ title_name: rung.titleName as string })
        .eq('title_definition_id', existingIdByLevel.get(rung.difficultyLevel));

      if (error) return { error };
    }
  }

  if (cleared.length > 0) {
    const { error } = await supabase
      .from('title_definition')
      .delete()
      .eq('activity_type', activityType)
      .in('difficulty_level', cleared);

    if (error) return { error };
  }

  return { error: null };
}

/** Removes a catalog's whole ladder. Used to unwind a failed create, not by the delete route —
 *  fk_title_definition_activity_type is ON DELETE CASCADE, so dropping the catalog takes the
 *  ladder with it. */
export async function deleteTitleLadder(
  supabase: SupabaseClient,
  activityType: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.from('title_definition').delete().eq('activity_type', activityType);
  return { error };
}

/**
 * Every distinct title name in use anywhere, alphabetically — the suggestion list behind the
 * authoring form's datalist, so an instructor can reuse "Story Apprentice" instead of inventing a
 * synonym.
 *
 * Deliberately not scoped to the caller's own catalogs: consistent naming across a course is the
 * entire point, and a title name discloses nothing about who authored it or which students hold
 * it. Note this hands back a name to copy, not a row to share — a title_definition row belongs to
 * exactly one (activity_type, difficulty_level) pair, so reusing a name still creates a new row.
 */
export async function listTitleNames(
  supabase: SupabaseClient,
): Promise<{ titleNames: string[] | null; error: { message: string } | null }> {
  const { data, error } = await supabase.from('title_definition').select('title_name').order('title_name');

  if (error) return { titleNames: null, error };

  const titleNames = [...new Set(((data ?? []) as { title_name: string }[]).map((row) => row.title_name))];
  return { titleNames, error: null };
}
