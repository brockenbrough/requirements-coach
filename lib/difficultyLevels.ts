// The difficulty-level picker labels, shared by every authoring form.
//
// GitHub #379 lifted these out of components/QuestionFormModal.tsx, where they were a private
// const, when the prompt form needed the identical control. Two copies of "Easy · Level 1" is
// exactly the kind of thing that drifts into "Level 1 · Easy" on one screen and nowhere else.

import type { Difficulty } from './activityContent';

export const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 1, label: 'Easy · Level 1' },
  { value: 2, label: 'Medium · Level 2' },
  { value: 3, label: 'Hard · Level 3' },
];

/** The short form, for badges and filter chips where the level number is already shown. */
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
