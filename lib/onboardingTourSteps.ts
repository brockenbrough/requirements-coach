// GitHub #318: the first-login guided tour's step configuration, kept as data so
// OnboardingTourProvider (state/persistence) and OnboardingTour (rendering) both work off the
// same source instead of a step list duplicated between them.

export type TourStep = {
  /** Matches a data-tour attribute rendered somewhere in AppShell — the element this step highlights. */
  target: string;
  title: string;
  description: string;
};

// Sidebar navigation general, then Activities, Courses, score/progress, and Profile. Courses
// (GitHub #242) sits right after Activities: both are "nav items you'd click to go somewhere",
// so they stay grouped before the score pill and Profile close out the tour.
export const studentTourSteps: TourStep[] = [
  {
    target: 'nav',
    title: 'Your navigation',
    description: 'Everything you need is one click away here: activities, courses, the leaderboard, and your profile.',
  },
  {
    target: 'nav-activities',
    title: 'Activities',
    description: 'Start here to practice. Pick an activity and a difficulty level, and work through a short round of questions.',
  },
  {
    target: 'nav-courses',
    title: 'Courses',
    description:
      'Join your instructor’s course here — search by course name, code, or instructor, and enter a course code (and enrollment key, if required) to get started.',
  },
  {
    target: 'score',
    title: 'Your score',
    description: 'Your cumulative score across every activity. Retaking a level only ever helps — a weaker attempt never lowers it.',
  },
  {
    target: 'nav-profile',
    title: 'Your profile',
    description: 'See the mastery titles you have earned, update your details, and revisit this tour any time from here.',
  },
];

// Sidebar navigation general, then Instructor Dashboard, Question Bank, and Courses — the four
// areas the issue names for an instructor. The LLM provider settings gear (GitHub #318 follow-up)
// comes last, after the day-to-day navigation is covered: it's a one-time setup step rather than
// something an instructor reaches for on every visit, so it doesn't compete with the nav items
// for the "first thing explained" slot.
export const instructorTourSteps: TourStep[] = [
  {
    target: 'nav',
    title: 'Your navigation',
    description: 'Everything you need as an instructor is one click away here: your dashboard, question bank, and courses.',
  },
  {
    target: 'nav-instructor',
    title: 'Instructor Dashboard',
    description: 'See every student’s activity in one place. Filter and sort to quickly find who might need a hand.',
  },
  {
    target: 'nav-instructor-questions',
    title: 'Question Bank',
    description: 'Review the questions your students are quizzed on, and add or edit your own.',
  },
  {
    target: 'nav-instructor-courses',
    title: 'Courses',
    description: 'Create courses, manage rosters, and share join codes with your students.',
  },
  {
    target: 'settings-gear',
    title: 'LLM provider settings',
    description:
      'Set up your LLM provider here — pick Claude, ChatGPT, or Gemini, choose a model, and add your API key so acceptance-criteria submissions get graded automatically.',
  },
];
