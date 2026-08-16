import type { ActivityType } from './activityTypes';

/**
 * 'write-acceptance-criteria' is the Type B (LLM-graded) activity from GitHub #149 (REQ-FU-2).
 * Unlike the MCQ activities it has no questionBank — students write free-text answers that are
 * scored by AI, not by picking from a fixed set of options.
 *
 * Widened to `string` (kept as an alias purely so existing `: ActivitySlug` annotations keep
 * compiling) for the same reason lib/activityTypes.ts's ActivityType was: a catalog reachable
 * through an assembled quiz belonging to a course a student is enrolled in
 * (lib/activityCourseQueries.ts) can be any activity_type, so app/activities/[slug]/page.tsx
 * routes on more than these three known slugs — see buildCustomActivityDefinition below for how
 * an unrecognized one is resolved.
 */
export type ActivitySlug = string;

export type Difficulty = 1 | 2 | 3;

export type AnswerOption = {
  id: string;
  text: string;
  score: number;
  maxScore: 25;
  correct: boolean;
  explanation: string;
};

export type Question = {
  id: string;
  difficulty: Difficulty;
  prompt: string;
  options: AnswerOption[];
};

export type ActivityDefinition = {
  slug: ActivitySlug;
  /**
   * The activity_type the API knows this activity by. The UI routes by slug, the
   * database keys on activity_type, and this is the only place the two are tied
   * together — see lib/activityTypes.ts for the allowed values.
   */
  activityType: ActivityType;
  name: string;
  summary: string;
  instructions: string;
  category: string;
  titles: Record<Difficulty, string>;
  /** MCQ activities populate this; LLM-graded activities (e.g. WRITE_ACCEPTANCE_CRITERIA) omit it. */
  questionBank?: Question[];
};

function opt(id: string, text: string, score: number, correct: boolean, explanation: string): AnswerOption {
  return { id, text, score, maxScore: 25, correct, explanation };
}

const weakUserStories: Question[] = [
  {
    id: 'wus-1-1',
    difficulty: 1,
    prompt: 'Which of these user stories is the weakest?',
    options: [
      opt('a', 'As a registered student, I want to log in with my school email, so that only verified students can access the practice activities.', 15, false, 'Names a real actor, a concrete action, and a testable rule (only verified students get in) — solid, not the weakest here.'),
      opt('b', 'As a user, I want the app to be good, so that I enjoy using it.', 25, true, '"Be good" and "enjoy using it" can\'t be tested or estimated — there\'s nothing here a developer could actually build against.'),
      opt('c', 'As a student, I want to see my score right after finishing an activity, so that I know how I did.', 8, false, 'Clear actor, clear trigger, clear outcome — this is a workable story, just not the strongest phrasing possible.'),
      opt('d', 'As an instructor, I want a list of my students, so that I can see who is enrolled.', 10, false, 'Reasonably concrete, though "see who is enrolled" could be sharpened into a specific view or report.'),
    ],
  },
  {
    id: 'wus-1-2',
    difficulty: 1,
    prompt: 'Which of these user stories is the weakest?',
    options: [
      opt('a', 'As a student, I want the system to be fast, so that I don\'t get bored.', 25, true, '"Fast" and "bored" have no numbers or observable behavior attached — there\'s no way to verify this is satisfied.'),
      opt('b', 'As a student, I want to resume an abandoned activity from where I left off, so that I don\'t lose progress if I close my browser.', 5, false, 'Specific actor, specific trigger, testable outcome (resumes at the right question) — one of the stronger stories here.'),
      opt('c', 'As an instructor, I want to export a class\'s activity results as a spreadsheet, so that I can archive them each semester.', 10, false, 'Concrete action and a clear reason; could be tightened by naming the export format, but it\'s far from the weakest.'),
      opt('d', 'As a student, I want to see which activity types exist, so that I can choose one to practice.', 12, false, 'Clear and small in scope — a reasonable, testable story.'),
    ],
  },
  {
    id: 'wus-1-3',
    difficulty: 1,
    prompt: 'Which of these user stories is the weakest?',
    options: [
      opt('a', 'As a student, I want a nice looking app, so that I like it.', 25, true, '"Nice looking" and "like it" are subjective with no acceptance test possible — this story can\'t be verified as done.'),
      opt('b', 'As a student, I want to pick one answer per question and submit it, so that my choice is recorded and scored.', 6, false, 'Names the actor, the action, and a checkable result — a strong, testable story.'),
      opt('c', 'As a student, I want to see the explanation for my chosen answer, so that I understand why it was right or wrong.', 9, false, 'Specific and testable — the explanation either appears or it doesn\'t.'),
      opt('d', 'As an instructor, I want to see how many students completed an activity, so that I can gauge participation.', 11, false, 'Clear and measurable, though it could specify a date range for extra precision.'),
    ],
  },
  {
    id: 'wus-1-4',
    difficulty: 1,
    prompt: 'Which of these user stories is the weakest?',
    options: [
      opt('a', 'As a student, I want the difficulty to increase after I score 80% or higher, so that I\'m challenged at the right level.', 8, false, 'Concrete trigger (80% threshold) and a clear, testable outcome — a strong story.'),
      opt('b', 'As a student, I want everything to feel smooth, so that using the app is pleasant.', 25, true, '"Feel smooth" and "pleasant" describe an impression, not a behavior — nothing here can be checked off as done.'),
      opt('c', 'As a student, I want to see my highest score for each activity, so that I know my personal best.', 7, false, 'Small, clear, and directly testable against stored data.'),
      opt('d', 'As an instructor, I want to know which questions students get wrong most often, so that I can adjust my teaching.', 13, false, 'Reasonably concrete; could be sharpened by naming a specific report, but still workable.'),
    ],
  },
  {
    id: 'wus-2-1',
    difficulty: 2,
    prompt: 'Which of these user stories is the weakest?',
    options: [
      opt('a', 'As a student, I want to abandon an in-progress activity, so that I can start fresh without old answers counting against me.', 10, false, 'Clear trigger and outcome — a workable, testable story.'),
      opt('b', 'As a student, I want better feedback on my answers, so that I learn more effectively.', 25, true, '"Better feedback" and "learn more effectively" aren\'t defined — better than what, and how would you measure "more effectively"? Nothing testable to build against.'),
      opt('c', 'As a student and instructor, I want to view activity results, so that we can both track progress.', 6, false, 'Bundles two different actors with two different needs into one story — a real weakness, but the benefit is at least concrete and testable, unlike option B.'),
      opt('d', 'As a student, I want my cumulative score to update after each completed activity, so that my profile always reflects my total effort.', 9, false, 'Specific trigger, specific and testable outcome.'),
    ],
  },
  {
    id: 'wus-2-2',
    difficulty: 2,
    prompt: 'Which of these user stories is the weakest?',
    options: [
      opt('a', 'As a student, I want the navigation bar to be intuitive, so that I can find things easily.', 22, true, '"Intuitive" and "easily" aren\'t observable — you can\'t write a pass/fail check for either one.'),
      opt('b', 'As a student, I want a list of prior attempts with date and score for each activity, so that I can track my history over time.', 8, false, 'Concrete data, concrete display — clearly testable.'),
      opt('c', 'As a student, I want the app, which I use on my phone and laptop and sometimes a shared lab computer, to remember my last activity across all of these so I never lose my place no matter what I\'m using.', 14, false, 'Testable in principle, but it\'s really three stories glued together (phone, laptop, lab computer) — too large to estimate or deliver as one unit.'),
      opt('d', 'As an instructor, I want to filter activity results by difficulty level, so that I can see how students perform at each level.', 7, false, 'Specific filter, specific and checkable outcome.'),
    ],
  },
  {
    id: 'wus-2-3',
    difficulty: 2,
    prompt: 'Which of these user stories is the weakest?',
    options: [
      opt('a', 'As a student, I want to see a confirmation before abandoning an activity, so that I don\'t lose progress by accident.', 6, false, 'Clear trigger and testable outcome — a solid story.'),
      opt('b', 'As someone using the app, I want things to make sense, so that I\'m not confused.', 25, true, 'The role is vague ("someone using the app"), and "make sense" / "not confused" can\'t be tested — this story fails Testable and lacks a clear actor.'),
      opt('c', 'As a student, I want to see the correct answer and its explanation when I answer incorrectly, so that I understand my mistake.', 9, false, 'Specific trigger and a directly testable outcome.'),
      opt('d', 'As an instructor, I want a dashboard summarizing all students\' titles and scores, so that I can spot who needs extra help at a glance.', 13, false, 'Concrete and checkable, though "at a glance" could be sharpened with a specific layout requirement.'),
    ],
  },
  {
    id: 'wus-2-4',
    difficulty: 2,
    prompt: 'Which of these user stories is the weakest?',
    options: [
      opt('a', 'As a student, I want a badge when I pass the hardest difficulty level, so that my achievement is recognized.', 11, false, 'Clear trigger (passing level 3) and a testable, visible outcome.'),
      opt('b', 'As a student, I want the whole gamification system — scores, titles, streaks, and badges — to keep me motivated long-term, so that I keep practicing.', 20, true, 'Bundles several distinct features into one story and rests on "motivated long-term," which no single release could ever prove true or false — it\'s neither Small nor Testable.'),
      opt('c', 'As a student, I want my current title for each activity type shown on my profile, so that I can see what I\'ve earned.', 8, false, 'Specific, small, and testable against stored session data.'),
      opt('d', 'As a student, I want a notification when I earn a new title, so that I immediately know I\'ve advanced.', 9, false, 'Clear trigger and a directly observable outcome.'),
    ],
  },
  {
    id: 'wus-3-1',
    difficulty: 3,
    prompt: 'Which of these user stories is the weakest?',
    options: [
      opt('a', 'As a student retaking a failed level, I want a newly selected set of random questions, so that I can\'t simply memorize answers from my last attempt.', 9, false, 'Specific actor and trigger, testable outcome — a well-formed story.'),
      opt('b', 'As a student, I want the system to be fair when selecting my next questions, so that I\'m evaluated accurately.', 24, true, '"Fair" and "accurate" sound reasonable but define no rule a developer could implement or test — compare to option A, which says exactly what "fair" means in practice.'),
      opt('c', 'As a student, I want each question to show its difficulty level, so that I understand why I\'m seeing it.', 10, false, 'Small, concrete, and directly testable.'),
      opt('d', 'As an instructor, I want to see the average score per difficulty level across my class, so that I can judge whether a level is too hard.', 12, false, 'Clear, measurable, and useful — a solid story, though it could name a specific calculation for full precision.'),
    ],
  },
  {
    id: 'wus-3-2',
    difficulty: 3,
    prompt: 'Which of these user stories is the weakest?',
    options: [
      opt('a', 'As a student, I want my session to record the last question I answered, so that resuming never repeats a completed question.', 8, false, 'Specific, testable, and directly tied to stored data.'),
      opt('b', 'As a student, I want the platform to respect my time, so that practicing doesn\'t feel like a burden.', 25, true, '"Respect my time" and "feel like a burden" are feelings, not behaviors — there\'s no way to write a test that passes or fails on this story.'),
      opt('c', 'As a student, I want partial credit for answers that aren\'t the single best choice, so that near-misses are still rewarded.', 15, false, 'Testable and well-scoped, though "near-misses" could be defined more precisely for full clarity.'),
      opt('d', 'As an instructor, I want to see which specific option students most often choose incorrectly, so that I can address common misconceptions in class.', 11, false, 'Concrete, measurable, and clearly valuable — one of the stronger stories here.'),
    ],
  },
  {
    id: 'wus-3-3',
    difficulty: 3,
    prompt: 'Which of these user stories is the weakest?',
    options: [
      opt('a', 'As a student, I want the app to scale with my skill level over time, so that it always feels appropriately challenging.', 23, true, '"Scale with my skill" and "feels appropriately challenging" describe a broad, ongoing impression rather than one testable, deliverable piece of behavior — this is closer to a goal than a story.'),
      opt('b', 'As a student, I want to advance to the next difficulty level after scoring 80% or higher, so that harder questions replace ones I\'ve already mastered.', 7, false, 'Precise threshold, precise and testable outcome.'),
      opt('c', 'As a student, I want to see the maximum possible score for an activity before I start, so that I know what I\'m working toward.', 13, false, 'Small, specific, and testable.'),
      opt('d', 'As an instructor, I want completed sessions marked as passed or not passed, so that I can quickly filter successful attempts.', 10, false, 'Clear, binary, and directly testable against stored data.'),
    ],
  },
  {
    id: 'wus-3-4',
    difficulty: 3,
    prompt: 'Which of these user stories is the weakest?',
    options: [
      opt('a', 'As a student, I want every part of my learning journey — question difficulty, feedback tone, and pacing — personalized to how I best learn, so that I improve as fast as possible.', 24, true, 'This bundles multiple unrelated features under a subjective goal ("improve as fast as possible") with no defined behavior — far too large to estimate and impossible to test as written.'),
      opt('b', 'As a student, I want to see my four questions for the current attempt drawn randomly from the level\'s question bank, so that repeat attempts don\'t feel identical.', 9, false, 'Specific mechanism and a testable, observable outcome.'),
      opt('c', 'As a student, I want an incorrect answer to still show me the correct one with its explanation, so that I can learn from the mistake immediately.', 8, false, 'Specific trigger, specific and testable outcome — well-formed.'),
      opt('d', 'As an instructor, I want to see a student\'s title history across all activity types on one page, so that I can review their overall growth.', 11, false, 'Concrete, testable, and clearly valuable.'),
    ],
  },
];

const weakAcceptanceCriteria: Question[] = [
  {
    id: 'wac-1-1',
    difficulty: 1,
    prompt: 'User story: "As a student, I want to submit my answer to a question, so that it counts toward my score." Which acceptance criterion is weakest?',
    options: [
      opt('a', 'Given the student has selected one option, when they click Submit, then the system records that option as their answer for the question.', 8, false, 'Specific trigger (Submit click) and a testable, observable outcome.'),
      opt('b', 'The submission process should work properly.', 25, true, '"Work properly" defines no observable behavior — there\'s no way to test whether this criterion passes or fails.'),
      opt('c', 'Given the student has not selected an option, when they click Submit, then the button remains disabled and no answer is recorded.', 6, false, 'Precise condition and a directly testable outcome.'),
      opt('d', 'Given an answer has been submitted, when the student tries to submit again for the same question, then the system ignores the second submission.', 10, false, 'Specific and testable, covering a real edge case.'),
    ],
  },
  {
    id: 'wac-1-2',
    difficulty: 1,
    prompt: 'User story: "As a student, I want to see feedback after answering, so that I understand my mistake." Which acceptance criterion is weakest?',
    options: [
      opt('a', 'Given the selected option is incorrect, when feedback is shown, then the explanation for the selected option and the correct option are both displayed.', 7, false, 'Specific condition, specific and testable outcome.'),
      opt('b', 'The feedback should be helpful and easy to understand.', 25, true, '"Helpful" and "easy to understand" are subjective — no test could confirm or deny this criterion is met.'),
      opt('c', 'Given the selected option is correct, when feedback is shown, then only the explanation for the correct option is displayed.', 9, false, 'Precise condition and a checkable, testable outcome.'),
      opt('d', 'Given feedback is displayed, when the student clicks Next, then the next unanswered question appears.', 11, false, 'Clear trigger, clear and testable outcome.'),
    ],
  },
  {
    id: 'wac-1-3',
    difficulty: 1,
    prompt: 'User story: "As a student, I want to resume an abandoned activity, so that I don\'t lose progress." Which acceptance criterion is weakest?',
    options: [
      opt('a', 'Given a session marked in-progress exists for the student and activity, when they open the activity, then they are offered Resume or Abandon.', 8, false, 'Precise condition and a testable, observable outcome.'),
      opt('b', 'Resuming should feel seamless.', 25, true, '"Feel seamless" describes an impression with no defined, checkable behavior — this criterion cannot be verified.'),
      opt('c', 'Given the student selects Resume, when the activity reopens, then the next unanswered question is shown, not a previously answered one.', 6, false, 'Specific and directly testable against session data.'),
      opt('d', 'Given the student selects Abandon, when they confirm, then the session status is set to abandoned and cannot be resumed.', 10, false, 'Clear, specific, and testable.'),
    ],
  },
  {
    id: 'wac-1-4',
    difficulty: 1,
    prompt: 'User story: "As a student, I want to see my highest score for an activity, so that I know my personal best." Which acceptance criterion is weakest?',
    options: [
      opt('a', 'Given the student has at least one completed session, when they open the activity\'s opening page, then the highest score across all completed sessions is displayed.', 8, false, 'Specific condition and a clearly testable outcome.'),
      opt('b', 'The score display should look nice on the page.', 25, true, '"Look nice" is a subjective visual judgment, not a testable behavior — there\'s nothing here to verify.'),
      opt('c', 'Given the student has no completed sessions, when they open the activity\'s opening page, then no score (or a placeholder) is shown instead of a number.', 9, false, 'Precise condition and a directly testable outcome.'),
      opt('d', 'Given a new session scores higher than the stored best, when it completes, then the displayed highest score updates to the new value.', 7, false, 'Clear trigger and a checkable, testable outcome.'),
    ],
  },
  {
    id: 'wac-2-1',
    difficulty: 2,
    prompt: 'User story: "As a student, I want the activity to advance in difficulty when I do well, so that I\'m challenged appropriately." Which acceptance criterion is weakest?',
    options: [
      opt('a', 'Given a completed session scores 80% or higher, when the result is recorded, then the student\'s next attempt at that activity uses level+1 questions.', 9, false, 'Precise threshold and a testable, observable outcome.'),
      opt('b', 'Given a completed session scores below 80%, when the result is recorded, then the student\'s next attempt repeats the same level with a new random set of questions.', 8, false, 'Precise and testable, and it correctly covers the "otherwise" branch.'),
      opt('c', 'The difficulty should progress at a reasonable pace for the student.', 25, true, '"Reasonable pace" defines no rule or threshold — compare to options A and B, which state the exact rule this criterion is trying to describe.'),
      opt('d', 'Given a student passes level 3, when the result is recorded, then the student is informed they\'ve completed this activity\'s skill track.', 12, false, 'Specific trigger and a directly testable, observable outcome.'),
    ],
  },
  {
    id: 'wac-2-2',
    difficulty: 2,
    prompt: 'User story: "As a student, I want my cumulative score to reflect my best efforts, so that retrying a level can only help me." Which acceptance criterion is weakest?',
    options: [
      opt('a', 'Given completed sessions exist at multiple difficulty levels for an activity, when the cumulative score is computed, then the highest score at each level is summed into the total.', 10, false, 'Specific rule and a directly testable calculation.'),
      opt('b', 'Given a student retakes a level and scores lower than a prior attempt, when the cumulative score is computed, then the prior, higher score is still the one counted.', 9, false, 'Covers a real edge case with a precise, testable rule.'),
      opt('c', 'The cumulative score should always feel rewarding to look at.', 25, true, '"Feel rewarding" is a subjective reaction, not a rule — it says nothing about what value should actually appear.'),
      opt('d', 'Given no sessions are completed for an activity, when the cumulative score is computed, then that activity contributes zero to the total.', 11, false, 'Specific and testable, covering the empty-state case.'),
    ],
  },
  {
    id: 'wac-2-3',
    difficulty: 2,
    prompt: 'User story: "As a student, I want to know when I\'ve earned a new title, so that I notice my progress." Which acceptance criterion is weakest?',
    options: [
      opt('a', 'Given a student passes a difficulty level for the first time, when the result screen is shown, then a notification names the new title and its activity type.', 8, false, 'Specific trigger and a directly testable, observable outcome.'),
      opt('b', 'Given a student has no passed sessions for an activity type, when their profile is viewed, then that activity\'s title reads "Not yet started."', 9, false, 'Precise condition and a checkable outcome — correctly covers the empty-state case.'),
      opt('c', 'New titles should be exciting for students to receive.', 25, true, '"Exciting" is an emotional reaction with no defined, testable behavior attached to it.'),
      opt('d', 'Given a student re-passes an already-passed level, when the result screen is shown, then no duplicate new-title notification is shown.', 13, false, 'Specific and testable, covering a real duplicate-notification edge case.'),
    ],
  },
  {
    id: 'wac-2-4',
    difficulty: 2,
    prompt: 'User story: "As an instructor, I want to review how my students are performing, so that I can offer help where it\'s needed." Which acceptance criterion is weakest?',
    options: [
      opt('a', 'Given an instructor opens the review page, when a student has completed sessions, then each session\'s activity type, date, and score are listed.', 9, false, 'Specific and directly testable against stored data.'),
      opt('b', 'Given an instructor opens the review page, when no students have completed any sessions, then an empty state is shown instead of an empty table.', 12, false, 'Testable and covers a real edge case, though it doesn\'t yet say what the empty state should contain.'),
      opt('c', 'The review page should give instructors good insight into their class.', 25, true, '"Good insight" is vague and unmeasurable — options A and B already describe the concrete data that would actually deliver insight.'),
      opt('d', 'Given a student has a passed session at difficulty level 3, when the instructor views that student\'s row, then it is visually distinguished from unpassed attempts.', 10, false, 'Specific and testable, though "visually distinguished" could name the exact treatment for full precision.'),
    ],
  },
  {
    id: 'wac-3-1',
    difficulty: 3,
    prompt: 'User story: "As a student, I want a session to resume exactly where I left off, so that switching devices doesn\'t cost me progress." Which acceptance criterion is weakest?',
    options: [
      opt('a', 'Given a session has 2 of 4 questions answered, when it is resumed on any device, then question 3 is presented first.', 10, false, 'Precise state and a directly testable, observable outcome.'),
      opt('b', 'Given a session is resumed, when the student answers the remaining questions, then the cumulative score continues from its previously stored value rather than resetting.', 9, false, 'Specific and testable against stored session data.'),
      opt('c', 'Given a session is resumed, when the page loads, then it should load quickly enough that the student doesn\'t get frustrated.', 24, true, '"Quickly enough" and "doesn\'t get frustrated" have no number or observable condition attached — compare to A and B, which state exact, checkable conditions.'),
      opt('d', 'Given a session was marked abandoned, when the student tries to resume it, then the system does not offer a resume option for that session.', 11, false, 'Specific condition and a clearly testable outcome.'),
    ],
  },
  {
    id: 'wac-3-2',
    difficulty: 3,
    prompt: 'User story: "As a student, I want incorrect answers explained clearly, so that I actually learn from mistakes." Which acceptance criterion is weakest?',
    options: [
      opt('a', 'Given the student selects an incorrect option, when feedback is shown, then that option\'s stored explanation is displayed verbatim.', 9, false, 'Specific, testable, and directly tied to stored data.'),
      opt('b', 'Given the student selects an incorrect option, when feedback is shown, then the correct option is visually marked and its stored explanation is also displayed.', 8, false, 'Precise and directly testable — correctly covers both required pieces of feedback.'),
      opt('c', 'Given feedback is shown, when the student reads it, then the explanation should be clear enough to genuinely improve their understanding.', 25, true, '"Genuinely improve their understanding" can\'t be measured by the system at feedback time — it describes a learning outcome, not a checkable behavior of the interface.'),
      opt('d', 'Given the student selects an incorrect option, when feedback is shown, then the selected option remains visibly marked as the student\'s choice alongside the correct one.', 12, false, 'Specific and testable, and a genuinely useful detail often left out of similar criteria.'),
    ],
  },
  {
    id: 'wac-3-3',
    difficulty: 3,
    prompt: 'User story: "As a student, I want my mastery titles to accurately reflect my standing, so that I trust what\'s shown on my profile." Which acceptance criterion is weakest?',
    options: [
      opt('a', 'Given a student\'s highest passed difficulty level for an activity type is 2, when their profile is viewed, then the title mapped to level 2 for that activity is shown.', 8, false, 'Specific rule and a directly testable, observable outcome.'),
      opt('b', 'Given no title definition exists for a passed difficulty level, when the profile is computed, then the system does not display an incorrect or default title in its place.', 15, false, 'Testable and covers a real gap, though it doesn\'t yet specify exactly what should be shown instead.'),
      opt('c', 'Titles should be recomputed often enough to always feel current.', 24, true, '"Often enough" and "feel current" set no actual rule — the real requirement (recompute at query time) is precise; this restates it vaguely.'),
      opt('d', 'Given a student has passed sessions in two different activity types, when their profile is viewed, then a separate title is shown for each activity type.', 10, false, 'Specific and directly testable against stored session data.'),
    ],
  },
  {
    id: 'wac-3-4',
    difficulty: 3,
    prompt: 'User story: "As a student, I want the four questions in an attempt to be genuinely random, so that memorizing one attempt doesn\'t guarantee success on the next." Which acceptance criterion is weakest?',
    options: [
      opt('a', 'Given a level\'s question bank has more than 4 questions, when a new session starts, then 4 questions are selected without repeating the same set as the immediately preceding attempt.', 13, false, 'Testable and addresses a real risk, though "without repeating the same set" could define exact odds for full precision.'),
      opt('b', 'Given a session starts, when questions are selected, then each question in the bank at that level has a fair and equal chance of being chosen.', 9, false, 'Precise, statistically checkable claim — directly testable.'),
      opt('c', 'The question selection should feel unpredictable to the student.', 25, true, '"Feel unpredictable" is a subjective impression; compare to B, which states the actual, verifiable randomness guarantee this criterion is trying to gesture at.'),
      opt('d', 'Given a level\'s question bank has exactly 4 questions, when a new session starts, then all 4 are used, in shuffled order.', 10, false, 'Specific edge case with a testable, observable outcome.'),
    ],
  },
];

export const ACTIVITIES: ActivityDefinition[] = [
  {
    slug: 'weak-user-stories',
    activityType: 'IDENTIFY_WEAK_USER_STORIES',
    name: 'Identify Weak User Stories',
    summary: 'Spot the weakest of four user stories and see why it fails the INVEST criteria.',
    instructions:
      'You\'ll see four user stories per round. Pick the single weakest one — the one that is least Independent, Negotiable, Valuable, Estimable, Small, or Testable. Score 75% or higher across a round to advance to the next difficulty level.',
    category: 'User Stories',
    titles: { 1: 'Story Apprentice', 2: 'Story Analyst', 3: 'Story Master' },
    questionBank: weakUserStories,
  },
  {
    slug: 'weak-acceptance-criteria',
    activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA',
    name: 'Identify Weak Acceptance Criteria',
    summary: 'Given a user story, find the acceptance criterion that is unclear, incomplete, or not testable.',
    instructions:
      'Each round shows a user story with four candidate acceptance criteria. Pick the single weakest one. Score 75% or higher across a round to advance to the next difficulty level.',
    category: 'Acceptance Criteria',
    titles: { 1: 'Criteria Novice', 2: 'Criteria Analyst', 3: 'Criteria Expert' },
    questionBank: weakAcceptanceCriteria,
  },
  {
    slug: 'write-acceptance-criteria',
    activityType: 'WRITE_ACCEPTANCE_CRITERIA',
    name: 'Write Acceptance Criteria',
    summary: 'Given a user story, write acceptance criteria that are clear, complete, and testable — then get AI feedback on your answer.',
    instructions:
      'You\'ll be given a user story. Write acceptance criteria for it. Your answer is scored by AI based on clarity, completeness, and testability.',
    category: 'Acceptance Criteria',
    titles: { 1: 'AC Beginner', 2: 'AC Practitioner', 3: 'AC Expert' },
  },
];

export function getActivity(slug: string): ActivityDefinition | undefined {
  return ACTIVITIES.find((a) => a.slug === slug);
}

/**
 * Builds an ActivityDefinition-shaped object for a course-scoped custom catalog — one not in the
 * static ACTIVITIES array above, reached by its activity_type key directly (lib/useResolvedActivity.ts
 * falls back to this when getActivity/getActivityByType both miss). slug is the activity_type
 * itself: a custom catalog has no separate display slug the way the three built-ins do, and the
 * key is already URL-safe (upper-case letters, digits, underscores — see slugifyQuizName).
 *
 * titles are generic ("Level 1/2/3") rather than omitted: nothing downstream (the play page's
 * title-toast diff, CompletedAttemptsTable) special-cases a missing titles field, so this keeps
 * the type honest instead of introducing an optional titles?: that every consumer would need to
 * guard against. A custom catalog's *actual* earned title (if any) still comes from
 * title_definition/computeStudentTitles like any other activity_type — this only supplies a
 * fallback for the ladder label, which nothing renders unless a title was actually earned.
 */
export function buildCustomActivityDefinition(entry: { activityType: string; name: string; description: string | null }): ActivityDefinition {
  return {
    slug: entry.activityType,
    activityType: entry.activityType,
    name: entry.name,
    summary: entry.description ?? 'A question catalog created by an instructor.',
    instructions: entry.description ?? 'Answer each question as best you can. Score 75% or higher to advance to the next difficulty level.',
    category: 'Custom',
    titles: { 1: 'Level 1', 2: 'Level 2', 3: 'Level 3' },
  };
}

/** The counterpart to getActivity for anything coming back from the API, which keys on activity_type. */
export function getActivityByType(activityType: string): ActivityDefinition | undefined {
  return ACTIVITIES.find((a) => a.activityType === activityType);
}

export function questionsForLevel(activity: ActivityDefinition, level: Difficulty): Question[] {
  return (activity.questionBank ?? []).filter((q) => q.difficulty === level);
}

export function getQuestion(activity: ActivityDefinition, questionId: string): Question | undefined {
  return (activity.questionBank ?? []).find((q) => q.id === questionId);
}
