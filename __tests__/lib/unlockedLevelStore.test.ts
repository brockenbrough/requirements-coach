import { describe, expect, it } from 'vitest';
import { newlyUnlockedLevel } from '../../lib/unlockedLevelStore';

// Only the pure half is covered here: the getter/setter pair is three lines of window access on
// top of lib/clientStorage.ts, and this project keeps no DOM tests (see CLAUDE.md's Tests
// section). newlyUnlockedLevel is where all the "should the animation play" judgement lives.
describe('newlyUnlockedLevel', () => {
  it('stays silent on a first visit, so a brand-new account is not congratulated for arriving', () => {
    expect(newlyUnlockedLevel(null, 1)).toBeNull();
  });

  it('stays silent on a first visit even when levels are already open elsewhere', () => {
    // A level passed on another device: this browser has no baseline to diff against, so it
    // records one quietly rather than replaying a celebration for something it never saw happen.
    expect(newlyUnlockedLevel(null, 3)).toBeNull();
  });

  it('reports the level that just became selectable', () => {
    expect(newlyUnlockedLevel(1, 2)).toBe(2);
    expect(newlyUnlockedLevel(2, 3)).toBe(3);
  });

  it('reports only the topmost level when the ceiling jumped more than one step', () => {
    expect(newlyUnlockedLevel(1, 3)).toBe(3);
  });

  it('stays silent when the ceiling did not move', () => {
    // Passing MAX_DIFFICULTY_LEVEL is the real case: nextDifficultyLevel(3) === 3, so mastering
    // the last level unlocks nothing further and must not animate.
    expect(newlyUnlockedLevel(3, 3)).toBeNull();
    expect(newlyUnlockedLevel(1, 1)).toBeNull();
  });

  it('never animates backwards', () => {
    // Defensive: a stale or corrupted snapshot must degrade to "nothing new", not to an unlock
    // animation on a level the student cannot select.
    expect(newlyUnlockedLevel(3, 2)).toBeNull();
  });
});
