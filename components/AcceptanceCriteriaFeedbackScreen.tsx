import type { AcceptanceCriteriaResult, UserStoryPrompt } from '../lib/acceptanceCriteriaTypes';
import { StoryDisplayCard } from './StoryDisplayCard';

/**
 * GitHub #149: the result phase of the "Write Acceptance Criteria" activity (REQ-FU-2) — the
 * free-text counterpart to FeedbackCard. Structurally mirrors it (prompt recap, then a score
 * panel, then an explanation block) but shows the student's own written answer back to them
 * instead of a set of pre-authored options, since there is nothing else to compare it against.
 *
 * GitHub #262: the story + the student's own answer now render together via StoryDisplayCard,
 * whose third section ("Acceptance Criteria") only exists here — the writing screen has nothing
 * to put there yet, since the story itself never has pre-written criteria.
 */
export function AcceptanceCriteriaFeedbackScreen({
  userStory,
  result,
}: {
  userStory: UserStoryPrompt;
  result: AcceptanceCriteriaResult;
}) {
  // 8/10 is this activity's own pass bar, independent of the Type A quiz's PASS_RATIO
  // (lib/sessionRules.ts) — the two are scored on different scales and are not coupled.
  const passed = result.score >= 8;

  return (
    <>
      <StoryDisplayCard description={userStory.description} acceptanceCriteria={result.submittedText} className="mb-5" />

      <div className={`mb-4 rounded-brand-lg p-6 text-center ${passed ? 'bg-gradient-to-br from-brand-teal-dark to-brand-navy-2' : 'bg-gradient-to-br from-brand-purple-dark to-brand-navy-2'}`}>
        <h2 className="text-xl font-extrabold text-white">{passed ? 'Nice work!' : 'Keep refining'}</h2>
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand-gold/15 px-3.5 py-1.5 text-sm font-extrabold text-brand-gold">
          {result.score} / 10
        </span>
      </div>

      <div className="rounded-brand-md border border-brand-navy-border bg-brand-navy-2 p-4 text-sm leading-relaxed text-brand-ink-muted">
        <strong className="mb-1 block font-extrabold text-white">Feedback</strong>
        {result.feedback}
      </div>
    </>
  );
}
