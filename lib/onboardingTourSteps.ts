// GitHub #318: the first-login guided tour's step configuration, kept as data so
// OnboardingTourProvider (state/persistence) and OnboardingTour (rendering) both work off the
// same source instead of a step list duplicated between them.

export type TourStep = {
  /** Matches a data-tour attribute rendered somewhere in AppShell — the element this step highlights. */
  target: string;
  title: string;
  description: string;
};

// Every item in STUDENT_NAV_ITEMS (AppShell.tsx) gets its own step, plus the score pill, in the
// exact top-to-bottom order they render in the sidebar (avatar → score pill → Dashboard → My
// Courses → Course Browser → Leaderboard → Profile) — a single sweep down the sidebar with no
// backtracking, so the spotlight never has to jump back up past an already-seen item. Dashboard
// and Leaderboard used to be skipped entirely even though the very first step's own description
// already promised "the leaderboard" among the things covered.
export const studentTourSteps: TourStep[] = [
  {
    target: 'nav',
    title: 'Your navigation',
    description: 'Everything you need is one click away here: your courses, the course browser, the leaderboard, and your profile.',
  },
  {
    target: 'score',
    title: 'Your score',
    description: 'Your cumulative score across every activity. Retaking a level only ever helps — a weaker attempt never lowers it.',
  },
  {
    target: 'nav-dashboard',
    title: 'Dashboard',
    description: 'Your home base after signing in — a snapshot of what you have in progress and where to pick back up.',
  },
  {
    target: 'nav-activities',
    title: 'My Courses',
    description: 'The courses you’ve joined. Click into one to see its quizzes, pick a difficulty level, and start practicing.',
  },
  {
    target: 'nav-courses',
    title: 'Course Browser',
    description:
      'Find your instructor’s course here — search by course name or professor, then enter the join code they gave you to get started.',
  },
  {
    target: 'nav-leaderboard',
    title: 'Leaderboard',
    description: 'See how you rank against your classmates in each course you’ve joined.',
  },
  {
    target: 'nav-profile',
    title: 'Your profile',
    description: 'See the mastery titles you have earned, update your details, and revisit this tour any time from here.',
  },
];

// Every item in INSTRUCTOR_NAV_ITEMS (AppShell.tsx) gets its own step, in the same order the
// sidebar renders them: Instructor Dashboard, Courses, Question Catalogs, Quizzes, Profile — the
// last of which used to be skipped entirely even though it's the same "revisit this tour any
// time" nav item the student tour already ends on. GitHub #359 folded the old, separate "Question
// Bank" step into Question Catalogs, since browsing/editing questions now happens per catalog at
// the same nav destination. Quizzes (GitHub #360) composes one or more catalogs for a course, so
// its step comes right after Question Catalogs. The LLM provider settings gear ('settings-gear',
// GitHub #318 follow-up) comes last, after every nav item is covered: it's a one-time setup step
// reached via its own icon button rather than the nav list, so it doesn't compete with the nav
// items for the "first thing explained" slot.
export const instructorTourSteps: TourStep[] = [
  {
    target: 'nav',
    title: 'Your navigation',
    description: 'Everything you need as an instructor is one click away here: your dashboard, courses, question catalogs, and quizzes.',
  },
  {
    target: 'nav-instructor',
    title: 'Instructor Dashboard',
    description: 'See every student’s activity in one place. Filter and sort to quickly find who might need a hand.',
  },
  {
    target: 'nav-instructor-courses',
    title: 'Courses',
    description: 'Create courses, manage rosters, and share join codes with your students.',
  },
  {
    target: 'nav-instructor-quizzes',
    title: 'Question Catalogs',
    description: 'Browse the catalogs your students are quizzed from, click into one to see its questions, and add or edit your own.',
  },
  {
    target: 'nav-instructor-assembled-quizzes',
    title: 'Quizzes',
    description: 'Compose a quiz for one of your courses from one or more question catalogs, and control exactly which questions are included.',
  },
  {
    target: 'nav-profile',
    title: 'Your profile',
    description: 'Update your details, and revisit this tour any time from here.',
  },
  {
    target: 'settings-gear',
    title: 'LLM provider settings',
    description:
      'Set up your LLM provider here — pick Claude, ChatGPT, or Gemini, choose a model, and add your API key so acceptance-criteria submissions get graded automatically.',
  },
];
