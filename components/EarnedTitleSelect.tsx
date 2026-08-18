'use client';

import type { MasteryTitleEntry } from '../lib/masteryTitles';

/**
 * Picks which mastery title the student wears next to their name.
 *
 * Every rung they have actually passed is offered, not just the highest one per quiz — having
 * reached "Story Analyst" doesn't mean they'd rather not display "Story Apprentice". Options are
 * grouped by quiz through native <optgroup>, which is also what makes the quiz titles themselves
 * visible here: the group label is the instructor's own quiz name (assembled_quiz.quiz_name, via
 * GET /api/students/{id}/available-titles), so a student can tell which quiz a title came from.
 *
 * A native <select> rather than a hand-built listbox, same call as
 * components/LeaderboardCourseSwitcher.tsx: keyboard handling, mobile pickers and grouping all come
 * for free, and the repo has no listbox primitive to reuse.
 */
export function EarnedTitleSelect({
  entries,
  value,
  onChange,
  disabled = false,
}: {
  entries: MasteryTitleEntry[];
  /** title_definition_id of the worn title, or null for none. */
  value: string | null;
  onChange: (titleDefinitionId: string | null) => void;
  disabled?: boolean;
}) {
  // A rung is offered only if it was passed AND has a title_definition row behind it. Without that
  // row there is no id to store and nothing to show — lib/masteryTitles.ts deliberately leaves such
  // a rung's title null rather than inventing a "Level N" placeholder.
  const groups = entries
    .map((entry) => ({
      activityType: entry.activityType,
      activityName: entry.activityName,
      rungs:
        entry.currentLevel === null
          ? []
          : entry.progression.filter(
              (rung) =>
                rung.difficultyLevel <= entry.currentLevel! && rung.title !== null && rung.titleDefinitionId !== null,
            ),
    }))
    .filter((group) => group.rungs.length > 0);

  if (groups.length === 0) {
    return (
      <p className="text-xs font-semibold text-gray-500">
        Pass a level to earn a title you can display here.
      </p>
    );
  }

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Displayed title</span>
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
        className="w-full rounded-brand-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-brand-navy transition focus:border-brand-purple focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-purple disabled:opacity-70"
      >
        <option value="">No title</option>
        {groups.map((group) => (
          <optgroup key={group.activityType} label={group.activityName}>
            {group.rungs.map((rung) => (
              <option key={rung.titleDefinitionId!} value={rung.titleDefinitionId!}>
                {rung.title} · Level {rung.difficultyLevel}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
