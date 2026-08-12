/**
 * GitHub #262: derives a short title from a user story's text and formats a story (plus, once
 * written, the student's own acceptance criteria) as clean, copyable markdown.
 *
 * user_story has only one text column, story_text (see lib/acceptanceCriteriaTypes.ts's own
 * comment on UserStoryPrompt.description) — there is no title column. Rather than inventing
 * content, the title is extracted from the story's own "I want to <goal>" clause, which every
 * seeded story already follows (the standard "As a <role>, I want to <goal>, so that <benefit>"
 * template — see supabase/seed.sql). A story that doesn't match the template falls back to a
 * generic label instead of rendering "undefined".
 */
const GOAL_CLAUSE = /,\s*i want (?:to\s+)?(.+?),\s*so that/i;

export function deriveStoryTitle(description: string): string {
  const match = description.match(GOAL_CLAUSE);
  if (!match) return 'User Story';

  const goal = match[1].trim().replace(/[.,;]+$/, '');
  if (!goal) return 'User Story';

  return goal.charAt(0).toUpperCase() + goal.slice(1);
}

export type StoryMarkdownInput = {
  title: string;
  description: string;
  /** The student's own written criteria, once submitted — omitted while still writing. */
  acceptanceCriteria?: string;
};

/**
 * One criterion per line in the output, whether or not the student already typed a leading
 * "-"/"*" — matches the Given/When/Then-per-line convention AcceptanceCriteriaWritingScreen's
 * placeholder and helper text ask for, without assuming the student actually followed it.
 */
export function formatStoryAsMarkdown({ title, description, acceptanceCriteria }: StoryMarkdownInput): string {
  const sections = [`# ${title}`, '', description];

  const criteria = (acceptanceCriteria ?? '')
    .split('\n')
    .map((line) => line.trim().replace(/^[-*]\s*/, ''))
    .filter((line) => line.length > 0);

  if (criteria.length > 0) {
    sections.push('', '## Acceptance Criteria', ...criteria.map((line) => `- ${line}`));
  }

  return sections.join('\n');
}
