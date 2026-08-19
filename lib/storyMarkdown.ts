/**
 * Formats a story (plus, once written, the student's own acceptance criteria) as clean, copyable
 * markdown.
 *
 * GitHub #262 originally derived `title` here from the story's own "I want to <goal>" clause via
 * a regex against the "As a <role>, I want to <goal>, so that <benefit>" template — but an
 * LLM-graded catalog's prompts are instructor-authored free text now (GitHub #379's "generalized
 * writing screen"), not guaranteed to follow that literal grammar, so the regex missed often
 * enough that students mostly saw its fallback label instead of a real title. Callers now pass
 * `title` in directly — StoryDisplayCard receives the catalog's own name, which is always
 * real and instructor-provided regardless of what the prompt text says.
 */
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
