import type { UserStoryPrompt } from './acceptanceCriteriaTypes';

/**
 * Placeholder for the real GET .../user-story draw (backed by supabase/schema.sql's user_story
 * table — see lib/acceptanceCriteriaClient.ts for what a real implementation needs). Nothing
 * behind this reads the database; it exists so AcceptanceCriteriaWritingScreen has a believable
 * prompt to render during development.
 */
export const MOCK_USER_STORIES: UserStoryPrompt[] = [
  {
    user_story_id: 'mock-story-1',
    story_text:
      'As a student, I want to resume an abandoned activity from where I left off, so that I don\'t lose progress if I close my browser.',
    difficulty_level: 1,
  },
  {
    user_story_id: 'mock-story-2',
    story_text:
      'As a student, I want to see my highest score for each activity, so that I know my personal best.',
    difficulty_level: 1,
  },
  {
    user_story_id: 'mock-story-3',
    story_text:
      'As a student, I want the activity to advance in difficulty when I score 80% or higher, so that I\'m challenged at the right level.',
    difficulty_level: 2,
  },
  {
    user_story_id: 'mock-story-4',
    story_text:
      'As an instructor, I want to review how my students are performing, so that I can offer help where it\'s needed.',
    difficulty_level: 2,
  },
];

export function pickRandomUserStory(): UserStoryPrompt {
  return MOCK_USER_STORIES[Math.floor(Math.random() * MOCK_USER_STORIES.length)];
}
