import { describe, expect, it } from 'vitest';
import { buildMasteryTitleEntries, totalLevelsPassed } from '../../lib/masteryTitles';
import type { AvailableActivityTitles } from '../../lib/leaderboardTypes';
import type { StudentTitle } from '../../lib/sessionClient';

const STORIES: AvailableActivityTitles = {
  activityType: 'IDENTIFY_WEAK_USER_STORIES',
  activityName: 'Identify Weak User Stories',
  courseId: 'course-1',
  courseName: 'Software Requirements',
  titles: [
    { difficultyLevel: 1, titleDefinitionId: 'title-story-1', title: 'Story Apprentice' },
    { difficultyLevel: 2, titleDefinitionId: 'title-story-2', title: 'Story Analyst' },
    { difficultyLevel: 3, titleDefinitionId: 'title-story-3', title: 'Story Expert' },
  ],
};

const CRITERIA: AvailableActivityTitles = {
  activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA',
  activityName: 'Identify Weak Acceptance Criteria',
  courseId: 'course-1',
  courseName: 'Software Requirements',
  titles: [
    { difficultyLevel: 1, titleDefinitionId: 'title-criteria-1', title: 'Criteria Apprentice' },
    { difficultyLevel: 2, titleDefinitionId: 'title-criteria-2', title: 'Criteria Analyst' },
    { difficultyLevel: 3, titleDefinitionId: 'title-criteria-3', title: 'Criteria Expert' },
  ],
};

const AVAILABLE: AvailableActivityTitles[] = [STORIES, CRITERIA];

describe('buildMasteryTitleEntries', () => {
  it('returns one entry per activity in availableTitles, in that order', () => {
    const entries = buildMasteryTitleEntries(AVAILABLE, []);

    expect(entries).toHaveLength(AVAILABLE.length);
    expect(entries.map((e) => e.activityType)).toEqual(AVAILABLE.map((a) => a.activityType));
  });

  it('returns nothing when the student is enrolled in no course with any linked activity', () => {
    expect(buildMasteryTitleEntries([], [])).toEqual([]);
  });

  it('marks an activity type the student never attempted as not yet started', () => {
    const entries = buildMasteryTitleEntries(AVAILABLE, []);

    for (const entry of entries) {
      expect(entry.currentLevel).toBeNull();
      expect(entry.currentTitle).toBeNull();
    }
  });

  it('fills in an activity type missing from the API response the same way (GitHub #39 AC)', () => {
    // GET /api/students/{id}/titles omits any activity type the student hasn't attempted at all.
    const apiTitles: StudentTitle[] = [
      { activityType: 'IDENTIFY_WEAK_USER_STORIES', difficultyLevel: 2, title: 'Story Analyst' },
    ];

    const entries = buildMasteryTitleEntries(AVAILABLE, apiTitles);
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

    const entries = buildMasteryTitleEntries(AVAILABLE, apiTitles);
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

    const entries = buildMasteryTitleEntries(AVAILABLE, apiTitles);
    const entry = entries.find((e) => e.activityType === 'IDENTIFY_WEAK_USER_STORIES')!;

    expect(entry.currentLevel).toBeNull();
    expect(entry.currentTitle).toBeNull();
  });

  it('includes the full three-level progression for every activity type, in level order', () => {
    const entries = buildMasteryTitleEntries(AVAILABLE, []);

    const stories = entries.find((e) => e.activityType === 'IDENTIFY_WEAK_USER_STORIES')!;
    expect(stories.progression.map((rung) => rung.title)).toEqual([
      'Story Apprentice',
      'Story Analyst',
      'Story Expert',
    ]);
  });

  // The generic "Level N" substitution that used to happen here is gone on purpose: it made an
  // untitled ladder render "Level 1" twice per rung (see components/TitleProgressionTrack.tsx) and
  // it made a rung with no title_definition row indistinguishable from one actually named "Level 1",
  // which the title dropdown has to be able to tell apart — only a real title can be worn.
  it('keeps a difficulty level with no title_definition row as a null title, not a "Level N" label', () => {
    const untitled: AvailableActivityTitles = {
      activityType: 'WRITE_ACCEPTANCE_CRITERIA',
      activityName: 'Write Acceptance Criteria',
      courseId: 'course-1',
      courseName: 'Software Requirements',
      titles: [
        { difficultyLevel: 1, titleDefinitionId: null, title: null },
        { difficultyLevel: 2, titleDefinitionId: null, title: null },
        { difficultyLevel: 3, titleDefinitionId: null, title: null },
      ],
    };

    const entries = buildMasteryTitleEntries([untitled], []);

    expect(entries[0].progression).toEqual([
      { difficultyLevel: 1, titleDefinitionId: null, title: null },
      { difficultyLevel: 2, titleDefinitionId: null, title: null },
      { difficultyLevel: 3, titleDefinitionId: null, title: null },
    ]);
  });

  it('keeps titled and untitled rungs apart within one ladder', () => {
    const partiallyTitled: AvailableActivityTitles = {
      ...STORIES,
      titles: [
        { difficultyLevel: 1, titleDefinitionId: 'title-story-1', title: 'Story Apprentice' },
        { difficultyLevel: 2, titleDefinitionId: null, title: null },
        { difficultyLevel: 3, titleDefinitionId: null, title: null },
      ],
    };

    const entries = buildMasteryTitleEntries([partiallyTitled], []);

    expect(entries[0].progression.map((rung) => rung.title)).toEqual(['Story Apprentice', null, null]);
    expect(entries[0].progression.map((rung) => rung.titleDefinitionId)).toEqual(['title-story-1', null, null]);
  });

  it('sorts the progression by difficulty level regardless of input order', () => {
    const outOfOrder: AvailableActivityTitles = {
      ...STORIES,
      titles: [...STORIES.titles].reverse(),
    };

    const entries = buildMasteryTitleEntries([outOfOrder], []);

    expect(entries[0].progression.map((rung) => rung.title)).toEqual([
      'Story Apprentice',
      'Story Analyst',
      'Story Expert',
    ]);
  });
});

describe('totalLevelsPassed', () => {
  it('is 0 when nothing has been passed', () => {
    expect(totalLevelsPassed(buildMasteryTitleEntries(AVAILABLE, []))).toBe(0);
  });

  it('sums currentLevel across activity types', () => {
    const apiTitles: StudentTitle[] = [
      { activityType: 'IDENTIFY_WEAK_USER_STORIES', difficultyLevel: 2, title: 'Story Analyst' },
      { activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', difficultyLevel: 1, title: 'Criteria Apprentice' },
    ];

    expect(totalLevelsPassed(buildMasteryTitleEntries(AVAILABLE, apiTitles))).toBe(3);
  });
});
