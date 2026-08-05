import type { QuizQuestion } from './quizQuestionTypes';

function options(
  texts: [string, string, string, string],
  correctIndex: number,
  idPrefix: string,
): QuizQuestion['answerOptions'] {
  return texts.map((text, index) => ({
    id: `${idPrefix}-opt-${index}`,
    text,
    isCorrect: index === correctIndex,
  }));
}

/**
 * Placeholder for the real question bank endpoint the Instructor's Question Bank + "Add
 * Question" flow (GitHub #120) is designed against — nothing behind this reads the database.
 * Whoever wires up the real backend replaces this export (and the local-state seeding in
 * app/instructor/questions/page.tsx) with a fetch (and its edit path with a real update call);
 * QuestionFormModal, AnswerOptionField, and the page's rendering don't change.
 */
export const MOCK_QUESTIONS: QuizQuestion[] = [
  {
    id: 'mock-wus-1-1',
    quizType: 'IDENTIFY_WEAK_USER_STORIES',
    level: 1,
    questionText: 'Which of these user stories is the weakest?',
    answerOptions: options(
      [
        'As a registered student, I want to log in with my school email, so that only verified students can access the practice activities.',
        'As a user, I want the app to be good, so that I enjoy using it.',
        'As a student, I want to see my score right after finishing an activity, so that I know how I did.',
        'As an instructor, I want a list of my students, so that I can see who is enrolled.',
      ],
      1,
      'mock-wus-1-1',
    ),
    explanation: '"Be good" and "enjoy using it" can\'t be tested or estimated — there\'s nothing here a developer could actually build against.',
  },
  {
    id: 'mock-wus-1-2',
    quizType: 'IDENTIFY_WEAK_USER_STORIES',
    level: 1,
    questionText: 'Which of these user stories is the weakest?',
    answerOptions: options(
      [
        'As a student, I want the system to be fast, so that I don\'t get bored.',
        'As a student, I want to resume an abandoned activity from where I left off, so that I don\'t lose progress.',
        'As an instructor, I want to export a class\'s results as a spreadsheet, so that I can archive them each semester.',
        'As a student, I want to see which activity types exist, so that I can choose one to practice.',
      ],
      0,
      'mock-wus-1-2',
    ),
    explanation: '"Fast" and "bored" have no numbers or observable behavior attached — there\'s no way to verify this is satisfied.',
  },
  {
    id: 'mock-wus-1-3',
    quizType: 'IDENTIFY_WEAK_USER_STORIES',
    level: 1,
    questionText: 'Which of these user stories is the weakest?',
    answerOptions: options(
      [
        'As a student, I want a nice looking app, so that I like it.',
        'As a student, I want to pick one answer per question and submit it, so that my choice is recorded and scored.',
        'As a student, I want to see the explanation for my chosen answer, so that I understand why it was right or wrong.',
        'As an instructor, I want to see how many students completed an activity, so that I can gauge participation.',
      ],
      0,
      'mock-wus-1-3',
    ),
    explanation: '"Nice looking" and "like it" are subjective with no acceptance test possible — this story can\'t be verified as done.',
  },
  {
    id: 'mock-wus-2-1',
    quizType: 'IDENTIFY_WEAK_USER_STORIES',
    level: 2,
    questionText: 'Which of these user stories is the weakest?',
    answerOptions: options(
      [
        'As a student, I want to abandon an in-progress activity, so that I can start fresh.',
        'As a student, I want better feedback on my answers, so that I learn more effectively.',
        'As a student and instructor, I want to view activity results, so that we can both track progress.',
        'As a student, I want my cumulative score to update after each completed activity, so that my profile always reflects my effort.',
      ],
      1,
      'mock-wus-2-1',
    ),
    explanation: '"Better feedback" and "more effectively" aren\'t defined — better than what, and how would you measure "more effectively"?',
  },
  {
    id: 'mock-wus-2-2',
    quizType: 'IDENTIFY_WEAK_USER_STORIES',
    level: 2,
    questionText: 'Which of these user stories is the weakest?',
    answerOptions: options(
      [
        'As a student, I want the navigation bar to be intuitive, so that I can find things easily.',
        'As a student, I want a list of prior attempts with date and score, so that I can track my history.',
        'As a student, I want the app to remember my last activity across my phone, laptop, and a shared lab computer.',
        'As an instructor, I want to filter activity results by difficulty level, so that I can see how students perform at each level.',
      ],
      0,
      'mock-wus-2-2',
    ),
    explanation: '"Intuitive" and "easily" aren\'t observable — you can\'t write a pass/fail check for either one.',
  },
  {
    id: 'mock-wus-3-1',
    quizType: 'IDENTIFY_WEAK_USER_STORIES',
    level: 3,
    questionText: 'Which of these user stories is the weakest?',
    answerOptions: options(
      [
        'As a student retaking a failed level, I want a newly selected set of random questions, so that I can\'t just memorize answers.',
        'As a student, I want the system to be fair when selecting my next questions, so that I\'m evaluated accurately.',
        'As a student, I want each question to show its difficulty level, so that I understand why I\'m seeing it.',
        'As an instructor, I want to see the average score per difficulty level across my class, so that I can judge whether a level is too hard.',
      ],
      1,
      'mock-wus-3-1',
    ),
    explanation: '"Fair" and "accurate" define no rule a developer could implement or test.',
  },
  {
    id: 'mock-wac-1-1',
    quizType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA',
    level: 1,
    questionText:
      'User story: "As a student, I want to submit my answer to a question, so that it counts toward my score." Which acceptance criterion is weakest?',
    answerOptions: options(
      [
        'Given the student has selected one option, when they click Submit, then the system records that option as their answer.',
        'The submission process should work properly.',
        'Given no option is selected, when they click Submit, then the button remains disabled and no answer is recorded.',
        'Given an answer has been submitted, when the student tries to submit again, then the system ignores the second submission.',
      ],
      1,
      'mock-wac-1-1',
    ),
    explanation: '"Work properly" defines no observable behavior — there\'s no way to test whether this criterion passes or fails.',
  },
  {
    id: 'mock-wac-1-2',
    quizType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA',
    level: 1,
    questionText:
      'User story: "As a student, I want to see feedback after answering, so that I understand my mistake." Which acceptance criterion is weakest?',
    answerOptions: options(
      [
        'Given the selected option is incorrect, when feedback is shown, then explanations for the selected and correct option are both displayed.',
        'The feedback should be helpful and easy to understand.',
        'Given the selected option is correct, when feedback is shown, then only the explanation for the correct option is displayed.',
        'Given feedback is displayed, when the student clicks Next, then the next unanswered question appears.',
      ],
      1,
      'mock-wac-1-2',
    ),
    explanation: '"Helpful" and "easy to understand" are subjective — no test could confirm or deny this criterion is met.',
  },
  {
    id: 'mock-wac-1-3',
    quizType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA',
    level: 1,
    questionText:
      'User story: "As a student, I want to resume an abandoned activity, so that I don\'t lose progress." Which acceptance criterion is weakest?',
    answerOptions: options(
      [
        'Given an in-progress session exists, when the student opens the activity, then they are offered Resume or Abandon.',
        'Resuming should feel seamless.',
        'Given the student selects Resume, then the next unanswered question is shown, not a previously answered one.',
        'Given the student selects Abandon and confirms, then the session status is set to abandoned and cannot be resumed.',
      ],
      1,
      'mock-wac-1-3',
    ),
    explanation: '"Feel seamless" describes an impression with no defined, checkable behavior — this criterion cannot be verified.',
  },
  {
    id: 'mock-wac-2-1',
    quizType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA',
    level: 2,
    questionText:
      'User story: "As a student, I want the activity to advance in difficulty when I do well, so that I\'m challenged appropriately." Which acceptance criterion is weakest?',
    answerOptions: options(
      [
        'Given a completed session scores 80% or higher, then the next attempt uses level+1 questions.',
        'Given a completed session scores below 80%, then the next attempt repeats the same level with a new random set.',
        'The difficulty should progress at a reasonable pace for the student.',
        'Given a student passes level 3, then they are informed they\'ve completed this activity\'s skill track.',
      ],
      2,
      'mock-wac-2-1',
    ),
    explanation: '"Reasonable pace" defines no rule or threshold — compare to the other options, which state the exact rule this criterion is trying to describe.',
  },
  {
    id: 'mock-wac-2-2',
    quizType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA',
    level: 2,
    questionText:
      'User story: "As a student, I want to know when I\'ve earned a new title, so that I notice my progress." Which acceptance criterion is weakest?',
    answerOptions: options(
      [
        'Given a student passes a difficulty level for the first time, then a notification names the new title and its activity type.',
        'Given a student has no passed sessions, then that activity\'s title reads "Not yet started."',
        'New titles should be exciting for students to receive.',
        'Given a student re-passes an already-passed level, then no duplicate new-title notification is shown.',
      ],
      2,
      'mock-wac-2-2',
    ),
    explanation: '"Exciting" is an emotional reaction with no defined, testable behavior attached to it.',
  },
  {
    id: 'mock-wac-3-1',
    quizType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA',
    level: 3,
    questionText:
      'User story: "As a student, I want a session to resume exactly where I left off, so that switching devices doesn\'t cost me progress." Which acceptance criterion is weakest?',
    answerOptions: options(
      [
        'Given a session has 2 of 4 questions answered, when resumed on any device, then question 3 is presented first.',
        'Given a session is resumed, the cumulative score continues from its stored value rather than resetting.',
        'Given a session is resumed, when the page loads, it should load quickly enough that the student doesn\'t get frustrated.',
        'Given a session was marked abandoned, when the student tries to resume it, the system does not offer a resume option.',
      ],
      2,
      'mock-wac-3-1',
    ),
    explanation: '"Quickly enough" and "doesn\'t get frustrated" have no number or observable condition attached.',
  },
];
