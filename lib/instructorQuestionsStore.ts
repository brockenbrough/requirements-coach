// Local cache for the instructor's question bank (GET /api/instructor/questions, GitHub #170).
// Same shape as instructorStudentsStore/activityLogStore: versioned key, SSR-guarded read/write,
// only typed getter/setter exported — no raw store object.
//
// Keyed by instructorId so the cache survives across mounts without re-fetching the whole bank,
// and so switching accounts on the same device doesn't serve one instructor's questions to
// another. Unlike instructorStudentsStore, this one *does* need invalidation: createQuestion/
// updateQuestion (lib/sessionClient.ts) write the fresh list back in on every save, since a
// question the instructor just added or edited is exactly the kind of change this page must
// never show stale.
import type { QuizQuestion } from './quizQuestionTypes';

const STORAGE_KEY = 'rc_instructor_questions_v1';

type InstructorQuestionsStore = Partial<Record<string, QuizQuestion[]>>;

function readStore(): InstructorQuestionsStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as InstructorQuestionsStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: InstructorQuestionsStore) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getCachedInstructorQuestions(instructorId: string): QuizQuestion[] | null {
  const store = readStore();
  return store[instructorId] ?? null;
}

export function setCachedInstructorQuestions(instructorId: string, questions: QuizQuestion[]): void {
  const store = readStore();
  store[instructorId] = questions;
  writeStore(store);
}

/** Drops every entry, for every instructor — see lib/clientCaches.ts. */
export function clearCachedInstructorQuestions(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
