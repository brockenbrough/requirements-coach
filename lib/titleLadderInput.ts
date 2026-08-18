// Body validation for a catalog's mastery title ladder, shared by POST /api/activities/types
// (authoring titles while creating the catalog) and PUT /api/instructor/quizzes/{activityType}/titles
// (editing them afterwards).
//
// It lives here rather than in either route because a Next.js route.ts may only export HTTP method
// handlers — same reason lib/userStoryInput.ts exists. Two routes accepting the same payload is
// exactly how they would eventually disagree about what a valid ladder is.

import { MAX_DIFFICULTY_LEVEL } from './sessionRules';

/** One rung as it arrives from a client: a level, and the title to put on it (null/'' clears it). */
export type TitleLadderRungInput = { difficultyLevel: number; titleName: string | null };

export type ValidatedTitleLadder = { ok: true; rungs: TitleLadderRungInput[] };
export type TitleLadderRejection = { ok: false; error: string };

/**
 * Validates and normalises a `titles` payload.
 *
 * A ladder may be partial or entirely empty — a catalog with no titles is the state every catalog
 * is in today, and lib/masteryTitles.ts already renders a missing rung as a plain "Level N" (see
 * progressionOf's docblock on why that rung must stay null rather than becoming a placeholder
 * title). So "no titles" is never an error; only a malformed payload is.
 *
 * A blank or whitespace-only name is normalised to null, meaning "clear this rung", rather than
 * rejected: an instructor emptying a field in the edit form is asking for exactly that, and making
 * them distinguish "empty" from "absent" would be a distinction without a difference.
 */
export function validateTitleLadder(input: unknown): ValidatedTitleLadder | TitleLadderRejection {
  if (input === undefined || input === null) return { ok: true, rungs: [] };
  if (!Array.isArray(input)) return { ok: false, error: 'titles must be an array.' };

  const rungs: TitleLadderRungInput[] = [];
  const seen = new Set<number>();

  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) {
      return { ok: false, error: 'Each title must be an object with difficultyLevel and titleName.' };
    }

    const { difficultyLevel, titleName } = raw as { difficultyLevel?: unknown; titleName?: unknown };

    if (
      typeof difficultyLevel !== 'number' ||
      !Number.isInteger(difficultyLevel) ||
      difficultyLevel < 1 ||
      difficultyLevel > MAX_DIFFICULTY_LEVEL
    ) {
      return { ok: false, error: `difficultyLevel must be a whole number between 1 and ${MAX_DIFFICULTY_LEVEL}.` };
    }

    // The database enforces this too (uq_title_definition_activity_level), but only across rows
    // already stored — a single payload naming level 2 twice would otherwise reach the upsert and
    // silently keep whichever one landed last.
    if (seen.has(difficultyLevel)) {
      return { ok: false, error: `difficultyLevel ${difficultyLevel} appears more than once.` };
    }
    seen.add(difficultyLevel);

    if (titleName !== null && titleName !== undefined && typeof titleName !== 'string') {
      return { ok: false, error: 'titleName must be a string or null.' };
    }

    const trimmed = typeof titleName === 'string' ? titleName.trim() : '';
    rungs.push({ difficultyLevel, titleName: trimmed === '' ? null : trimmed });
  }

  return { ok: true, rungs };
}
