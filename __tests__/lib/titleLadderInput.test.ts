import { describe, expect, it } from 'vitest';
import { validateTitleLadder } from '../../lib/titleLadderInput';

describe('validateTitleLadder', () => {
  it('treats a missing ladder as an empty one, not an error', () => {
    expect(validateTitleLadder(undefined)).toEqual({ ok: true, rungs: [] });
    expect(validateTitleLadder(null)).toEqual({ ok: true, rungs: [] });
  });

  it('trims names', () => {
    const result = validateTitleLadder([{ difficultyLevel: 1, titleName: '  Story Apprentice  ' }]);
    expect(result).toEqual({ ok: true, rungs: [{ difficultyLevel: 1, titleName: 'Story Apprentice' }] });
  });

  // An instructor emptying a field in the edit form is asking for the rung to be cleared, which is
  // a legal state — not a validation failure.
  it('normalises a blank or whitespace-only name to null', () => {
    const result = validateTitleLadder([
      { difficultyLevel: 1, titleName: '' },
      { difficultyLevel: 2, titleName: '   ' },
      { difficultyLevel: 3, titleName: null },
    ]);

    expect(result).toEqual({
      ok: true,
      rungs: [
        { difficultyLevel: 1, titleName: null },
        { difficultyLevel: 2, titleName: null },
        { difficultyLevel: 3, titleName: null },
      ],
    });
  });

  it('accepts a partial ladder', () => {
    const result = validateTitleLadder([{ difficultyLevel: 2, titleName: 'Story Analyst' }]);
    expect(result).toEqual({ ok: true, rungs: [{ difficultyLevel: 2, titleName: 'Story Analyst' }] });
  });

  it('rejects a non-array payload', () => {
    expect(validateTitleLadder('Story Apprentice')).toEqual({ ok: false, error: 'titles must be an array.' });
  });

  it('rejects a level outside 1..3', () => {
    expect(validateTitleLadder([{ difficultyLevel: 0, titleName: 'x' }]).ok).toBe(false);
    expect(validateTitleLadder([{ difficultyLevel: 4, titleName: 'x' }]).ok).toBe(false);
    expect(validateTitleLadder([{ difficultyLevel: 1.5, titleName: 'x' }]).ok).toBe(false);
  });

  // uq_title_definition_activity_level only guards rows already stored; a payload naming one level
  // twice would otherwise reach the upsert and silently keep whichever landed last.
  it('rejects the same level twice in one payload', () => {
    const result = validateTitleLadder([
      { difficultyLevel: 1, titleName: 'First' },
      { difficultyLevel: 1, titleName: 'Second' },
    ]);

    expect(result).toEqual({ ok: false, error: 'difficultyLevel 1 appears more than once.' });
  });

  it('rejects a non-string title name', () => {
    expect(validateTitleLadder([{ difficultyLevel: 1, titleName: 42 }]).ok).toBe(false);
  });

  it('rejects a rung that is not an object', () => {
    expect(validateTitleLadder(['Story Apprentice']).ok).toBe(false);
  });
});
