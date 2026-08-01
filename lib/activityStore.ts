import { ACTIVITIES, ActivitySlug, Difficulty, getActivity, getQuestion, questionsForLevel } from './activityContent';

export type HistoryEntry = {
  level: Difficulty;
  score: number;
  maxScore: number;
  passed: boolean;
  completedAt: string;
};

export type InProgressSession = {
  level: Difficulty;
  questionIds: string[];
  answeredIds: string[];
  cumulativeScore: number;
  startedAt: string;
};

export type ActivityState = {
  level: Difficulty;
  history: HistoryEntry[];
  inProgress: InProgressSession | null;
};

// Mock persistence: this whole module reads/writes localStorage in place of
// the REQ-DL-1..4 database tables (question bank, answer bank, session log,
// answered-question log), which do not exist yet. Swapping this out for a
// real backend later means replacing every function body below with a fetch
// call to the corresponding API route, while keeping the same signatures.
const STORAGE_KEY = 'rc_activity_progress_v1';

type StoreShape = Partial<Record<ActivitySlug, ActivityState>>;

function readStore(): StoreShape {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoreShape) : {};
  } catch {
    return {};
  }
}

function writeStore(store: StoreShape) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function defaultState(): ActivityState {
  return { level: 1, history: [], inProgress: null };
}

export function getActivityState(slug: ActivitySlug): ActivityState {
  return readStore()[slug] ?? defaultState();
}

function setActivityState(slug: ActivitySlug, state: ActivityState) {
  const store = readStore();
  store[slug] = state;
  writeStore(store);
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function startSession(slug: ActivitySlug): ActivityState {
  const activity = getActivity(slug);
  if (!activity) throw new Error(`Unknown activity: ${slug}`);
  const state = getActivityState(slug);
  const pool = questionsForLevel(activity, state.level);
  const picked = shuffle(pool).slice(0, 4).map((q) => q.id);
  const inProgress: InProgressSession = {
    level: state.level,
    questionIds: picked,
    answeredIds: [],
    cumulativeScore: 0,
    startedAt: new Date().toISOString(),
  };
  const next: ActivityState = { ...state, inProgress };
  setActivityState(slug, next);
  return next;
}

export function abandonSession(slug: ActivitySlug): ActivityState {
  const state = getActivityState(slug);
  const next: ActivityState = { ...state, inProgress: null };
  setActivityState(slug, next);
  return next;
}

export function currentQuestionId(state: ActivityState): string | null {
  if (!state.inProgress) return null;
  const { questionIds, answeredIds } = state.inProgress;
  return questionIds[answeredIds.length] ?? null;
}

export function answerQuestion(slug: ActivitySlug, optionId: string) {
  const activity = getActivity(slug);
  if (!activity) throw new Error(`Unknown activity: ${slug}`);
  const state = getActivityState(slug);
  if (!state.inProgress) throw new Error('No session in progress');
  const qid = currentQuestionId(state);
  if (!qid) throw new Error('No current question');
  const question = getQuestion(activity, qid);
  if (!question) throw new Error('Question not found');
  const selected = question.options.find((o) => o.id === optionId);
  if (!selected) throw new Error('Option not found');
  const correctOption = question.options.find((o) => o.correct);
  if (!correctOption) throw new Error('Question has no correct option');

  const inProgress = state.inProgress;
  const updatedInProgress: InProgressSession = {
    ...inProgress,
    answeredIds: [...inProgress.answeredIds, qid],
    cumulativeScore: inProgress.cumulativeScore + selected.score,
  };
  const isComplete = updatedInProgress.answeredIds.length >= updatedInProgress.questionIds.length;

  let nextState: ActivityState;
  if (isComplete) {
    const maxScore = updatedInProgress.questionIds.length * 25;
    const passed = updatedInProgress.cumulativeScore / maxScore >= 0.8;
    const historyEntry: HistoryEntry = {
      level: updatedInProgress.level,
      score: updatedInProgress.cumulativeScore,
      maxScore,
      passed,
      completedAt: new Date().toISOString(),
    };
    const nextLevel: Difficulty = passed && state.level < 3 ? ((state.level + 1) as Difficulty) : state.level;
    nextState = { level: nextLevel, history: [historyEntry, ...state.history], inProgress: null };
  } else {
    nextState = { ...state, inProgress: updatedInProgress };
  }
  setActivityState(slug, nextState);

  return {
    question,
    selected,
    correctOption,
    correct: selected.correct,
    cumulativeScore: updatedInProgress.cumulativeScore,
    maxScore: updatedInProgress.questionIds.length * 25,
    isComplete,
    state: nextState,
  };
}

export function getTitle(slug: ActivitySlug): string {
  const activity = getActivity(slug);
  if (!activity) return 'Not yet started';
  const state = getActivityState(slug);
  const passedLevels = state.history.filter((h) => h.passed).map((h) => h.level);
  if (passedLevels.length === 0) return 'Not yet started';
  const highest = Math.max(...passedLevels) as Difficulty;
  return activity.titles[highest];
}

export function getBestScore(slug: ActivitySlug): { score: number; maxScore: number } | null {
  const state = getActivityState(slug);
  if (state.history.length === 0) return null;
  return state.history.reduce((best, h) => (h.score > best.score ? h : best), state.history[0]);
}

export function getHighestTitleOverall(): { title: string; activityName: string } | null {
  let best: { title: string; activityName: string; level: Difficulty } | null = null;
  for (const activity of ACTIVITIES) {
    const state = getActivityState(activity.slug);
    const passedLevels = state.history.filter((h) => h.passed).map((h) => h.level);
    if (passedLevels.length === 0) continue;
    const highest = Math.max(...passedLevels) as Difficulty;
    if (!best || highest > best.level) {
      best = { title: activity.titles[highest], activityName: activity.name, level: highest };
    }
  }
  return best ? { title: best.title, activityName: best.activityName } : null;
}
