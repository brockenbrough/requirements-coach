import { describe, expect, it } from 'vitest';
import { buildMasteryTitleEntries, totalLevelsPassed } from '../../lib/masteryTitles';
import { ACTIVITIES } from '../../lib/activityContent';
import type { StudentTitle } from '../../lib/sessionClient';

describe('buildMasteryTitleEntries', () => {
  it('returns one entry per known activity type, in ACTIVITIES order', () => {
    const entries = buildMasteryTitleEntries([]);

    expect(entries).toHaveLength(ACTIVITIES.length);
    expect(entries.map((e) => e.activityType)).toEqual(ACTIVITIES.map((a) => a.activityType));
  });

  it('marks an activity type the student never attempted as not yet started', () => {
    const entries = buildMasteryTitleEntries([]);

    for (const entry of entries) {
      expect(entry.currentLevel).toBeNull();
      expect(entry.currentTitle).toBeNull();
    }
  });

  it('fills in an activity type missing from the API response the same way (GitHub #39 AC)', () => {
    // Only one of the three known activity types is present — GET /api/students/{id}/titles
    // omits any activity type the student hasn't attempted at all (see its own docstring).
    const apiTitles: StudentTitle[] = [
      { activityType: 'IDENTIFY_WEAK_USER_STORIES', difficultyLevel: 2, title: 'Story Analyst' },
    ];

    const entries = buildMasteryTitleEntries(apiTitles);
    const untouched = entries.filter((e) => e.activityType !== 'IDENTIFY_WEAK_USER_STORIES');

    expect(untouched.length).toBeGreaterThan(0);
    for (const entry of untouched) {
      expect(entry.currentLevel).toBeNull();
      expect(entry.currentTitle).toBeNull();
    }
  });

  it('carries over the current level and title for an attempted, passed activity type', () => {
    const apiTitles: StudentTitle[] = [
      { activityType: 'IDENTIFY_WEAK_USER_STORIES', difficultyLevel: 2, title: 'Story Analyst' },
    ];

    const entries = buildMasteryTitleEntries(apiTitles);
    const entry = entries.find((e) => e.activityType === 'IDENTIFY_WEAK_USER_STORIES')!;

    expect(entry.currentLevel).toBe(2);
    expect(entry.currentTitle).toBe('Story Analyst');
  });

  it('treats an attempted-but-never-passed activity type as not yet started', () => {
    // computeStudentTitles: difficultyLevel is null and title is "Not yet started" (a string,
    // not null) when the student has attempted but never passed a level.
    const apiTitles: StudentTitle[] = [
      { activityType: 'IDENTIFY_WEAK_USER_STORIES', difficultyLevel: null, title: 'Not yet started' },
    ];

    const entries = buildMasteryTitleEntries(apiTitles);
    const entry = entries.find((e) => e.activityType === 'IDENTIFY_WEAK_USER_STORIES')!;

    expect(entry.currentLevel).toBeNull();
    expect(entry.currentTitle).toBeNull();
  });

  it('includes the full three-level progression for every activity type', () => {
    const entries = buildMasteryTitleEntries([]);

    for (const entry of entries) {
      expect(entry.progression).toHaveLength(3);
      expect(entry.progression.every((title) => typeof title === 'string' && title.length > 0)).toBe(true);
    }
  });
});

describe('totalLevelsPassed', () => {
  it('is 0 when nothing has been passed', () => {
    expect(totalLevelsPassed(buildMasteryTitleEntries([]))).toBe(0);
  });

  it('sums currentLevel across activity types', () => {
    const apiTitles: StudentTitle[] = [
      { activityType: 'IDENTIFY_WEAK_USER_STORIES', difficultyLevel: 2, title: 'Story Analyst' },
      { activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', difficultyLevel: 1, title: 'Criteria Novice' },
    ];

    expect(totalLevelsPassed(buildMasteryTitleEntries(apiTitles))).toBe(3);
  });
});
