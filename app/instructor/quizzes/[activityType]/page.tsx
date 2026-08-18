'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../../components/AppShell';
import { CatalogPromptCard } from '../../../../components/CatalogPromptCard';
import { ConfirmModal } from '../../../../components/ConfirmModal';
import { DeleteQuestionModal } from '../../../../components/DeleteQuestionModal';
import { PromptFormModal } from '../../../../components/PromptFormModal';
import { QuestionFormModal } from '../../../../components/QuestionFormModal';
import { RatingPromptModal } from '../../../../components/RatingPromptModal';
import {
  deleteCatalog,
  loadQuizDetail,
  loadTitleNames,
  saveTitleLadder,
  updateRatingPrompt,
  type QuizMeta,
} from '../../../../lib/quizClient';
import type { StoredTitleRung } from '../../../../lib/titleAuthoringQueries';
import {
  emptyTitleLadderDraft,
  TitleLadderFields,
  titleLadderDraftToRungs,
  type TitleLadderDraft,
} from '../../../../components/TitleLadderFields';
import { createQuestion, updateQuestion } from '../../../../lib/sessionClient';
import {
  createUserStory,
  deleteUserStory,
  updateUserStory,
  type UserStoryDraft,
} from '../../../../lib/llmActivityClient';
import type { CatalogUserStory } from '../../../../lib/llmActivityTypes';
import { STORIES_PER_SESSION } from '../../../../lib/llmActivityRules';
import { DIFFICULTY_LABEL as LEVEL_LABEL } from '../../../../lib/difficultyLevels';
import type { CatalogQuestion, QuizQuestion } from '../../../../lib/quizQuestionTypes';
import { useRequireRole } from '../../../../lib/useRequireRole';

const LEVEL_OPTIONS = ['all', 1, 2, 3] as const;

/** The stored ladder (only levels that have a title) widened into a full per-level form draft. */
function titleLadderToDraft(titles: StoredTitleRung[]): TitleLadderDraft {
  const draft = emptyTitleLadderDraft();
  for (const rung of titles) draft[rung.difficultyLevel] = rung.titleName;
  return draft;
}
const HIGHLIGHT_MS = 4000;
const TOAST_MS = 3200;

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

type ModalState = { mode: 'add' } | { mode: 'edit'; question: CatalogQuestion };
type PromptModalState = { mode: 'add' } | { mode: 'edit'; prompt: CatalogUserStory };

/**
 * GitHub #379: the levels whose prompt pool is too small to draw a round from. The LLM session
 * draw filters user_story by difficulty_level and needs STORIES_PER_SESSION of them, so a level
 * below that fails at Start with a 400 — and nothing else in the app would tell the instructor
 * before a student hits it. Same early-warning role as the per-level coverage banner on
 * app/instructor/assembled-quizzes/[quizId]/page.tsx.
 *
 * A level with zero prompts counts as short too: an instructor who has only filled level 1 should
 * see that levels 2 and 3 are unplayable, not just unmentioned.
 */
function shortLevels(prompts: CatalogUserStory[]): (1 | 2 | 3)[] {
  return ([1, 2, 3] as const).filter(
    (level) => prompts.filter((prompt) => prompt.level === level).length < STORIES_PER_SESSION,
  );
}

/**
 * GitHub #359: one question catalog's detail view — read-only by default (every question in the
 * catalog, per GET /api/instructor/quizzes/{activityType}, which now 403s unless the caller
 * created this catalog), an "Edit" toggle away from add/edit/delete on the caller's own questions.
 * Replaces the retired flat Question Bank page; see CLAUDE.md for how this relates to the "quiz"
 * plumbing from GitHub #347 it's built on.
 *
 * A question has exactly one activity_type column (no join table), so every mutation here is
 * naturally scoped to this catalog alone — there's no cross-catalog side effect to guard against.
 */
export default function CatalogDetailPage({ params }: { params: { activityType: string } }) {
  const { token, profile, loading, authorized } = useRequireRole('instructor');
  const router = useRouter();

  const [quiz, setQuiz] = useState<QuizMeta | null>(null);
  const [questions, setQuestions] = useState<CatalogQuestion[] | null>(null);
  const [prompts, setPrompts] = useState<CatalogUserStory[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const [level, setLevel] = useState<1 | 2 | 3 | 'all'>('all');
  const [editMode, setEditMode] = useState(false);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CatalogQuestion | null>(null);
  const [promptModalState, setPromptModalState] = useState<PromptModalState | null>(null);
  const [promptDeleteTarget, setPromptDeleteTarget] = useState<CatalogUserStory | null>(null);
  const [highlight, setHighlight] = useState<{ id: string; label: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showDeleteCatalog, setShowDeleteCatalog] = useState(false);
  const [ratingPromptModalOpen, setRatingPromptModalOpen] = useState(false);

  const [titleDraft, setTitleDraft] = useState<TitleLadderDraft>(emptyTitleLadderDraft);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [savingTitles, setSavingTitles] = useState(false);
  const [titleError, setTitleError] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setLoadFailed(false);
    setNotFound(false);
    setForbidden(false);

    loadQuizDetail(token, params.activityType).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setQuiz(result.data.quiz);
        setQuestions(result.data.questions);
        setPrompts(result.data.userStories);
        setTitleDraft(titleLadderToDraft(result.data.titles));
      } else if (result.status === 404) {
        setNotFound(true);
      } else if (result.status === 403) {
        setForbidden(true);
      } else {
        setLoadFailed(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token, params.activityType, retryCount]);

  // Suggestions only — a failure leaves the title fields working as plain text inputs, so it is
  // deliberately not surfaced as a page error.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    loadTitleNames(token).then((result) => {
      if (!cancelled && result.ok) setTitleSuggestions(result.data.titleNames);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSaveTitles() {
    if (!token) return;
    setSavingTitles(true);
    setTitleError('');

    const result = await saveTitleLadder(token, params.activityType, titleLadderDraftToRungs(titleDraft));
    setSavingTitles(false);

    if (!result.ok) {
      setTitleError(result.error);
      return;
    }

    // Re-seed from what the server actually stored rather than keeping the local draft — the two
    // can differ (trimming, a rung cleared to null), and the stored version is the truth.
    setTitleDraft(titleLadderToDraft(result.data.titles));
    setToastMessage('Mastery titles saved.');
  }

  if (loading || !authorized) return null;
  if (!token || !profile) return null;

  const llmGraded = quiz?.gradingKind === 'llm-graded';
  const items = llmGraded ? prompts ?? [] : questions ?? [];
  const visibleQuestions = (questions ?? []).filter((question) => level === 'all' || question.level === level);
  const visiblePrompts = (prompts ?? []).filter((prompt) => level === 'all' || prompt.level === level);
  const quizOptions = quiz ? [{ value: params.activityType, label: quiz.name }] : [];
  const coverageGaps = llmGraded ? shortLevels(prompts ?? []) : [];

  async function handleSaveQuestion(question: QuizQuestion): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!token || !profile?.user_id) return { ok: false, error: 'Your session has expired. Please sign in again.' };

    const isEdit = modalState?.mode === 'edit';
    const result = isEdit ? await updateQuestion(token, question) : await createQuestion(token, question);
    if (!result.ok) return { ok: false, error: result.error };

    // POST assigns real UUIDs server-side; the modal's placeholder ids (q-${Date.now()}, etc.)
    // must not be kept. Editing preserves ownerId from the row already in state — this route only
    // ever edits the caller's own questions (the icon is hidden otherwise), but the response to
    // PATCH carries no ownerId to read it back from.
    const savedQuestion: CatalogQuestion = isEdit
      ? { ...question, ownerId: modalState?.mode === 'edit' ? modalState.question.ownerId : profile.user_id }
      : {
          ...question,
          id: result.data.questionId,
          answerOptions: question.answerOptions.map((option, index) => ({
            ...option,
            id: result.data.answerIds[index],
          })),
          ownerId: profile.user_id,
        };

    setQuestions((current) =>
      isEdit
        ? (current ?? []).map((existing) => (existing.id === savedQuestion.id ? savedQuestion : existing))
        : [savedQuestion, ...(current ?? [])],
    );

    // The filter now seeds the modal's level (GitHub #417), so what was just saved is usually
    // already inside the filtered level and visible. Only a level the instructor changed inside
    // the modal needs the filter opened up, so the row can't vanish the moment it is written.
    if (level !== 'all' && savedQuestion.level !== level) setLevel('all');
    setHighlight({ id: savedQuestion.id, label: isEdit ? '✓ Updated' : '✓ Just added' });
    setToastMessage(isEdit ? 'Changes saved.' : 'Question added to this catalog.');

    window.setTimeout(() => setToastMessage(null), TOAST_MS);
    window.setTimeout(() => setHighlight(null), HIGHLIGHT_MS);

    return { ok: true };
  }

  async function handleSavePrompt(draft: UserStoryDraft): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!token || !profile?.user_id) return { ok: false, error: 'Your session has expired. Please sign in again.' };

    const isEdit = promptModalState?.mode === 'edit';
    const editingId = promptModalState?.mode === 'edit' ? promptModalState.prompt.id : null;

    const result = isEdit
      ? await updateUserStory(token, editingId!, draft)
      : await createUserStory(token, draft);

    if (!result.ok) return { ok: false, error: result.error };

    // Same shape as handleSaveQuestion above: POST assigns the real id server-side, PATCH echoes
    // the one we already had, and ownerId can only ever be the caller (the icons that open this
    // form are hidden on anyone else's rows).
    const saved: CatalogUserStory = {
      id: isEdit ? editingId! : result.data.userStoryId,
      activityType: draft.activityType,
      level: draft.difficultyLevel,
      storyText: draft.storyText,
      ownerId: profile.user_id,
    };

    setPrompts((current) =>
      isEdit
        ? (current ?? []).map((existing) => (existing.id === saved.id ? saved : existing))
        : [saved, ...(current ?? [])],
    );

    // Same rule as handleSaveQuestion above (GitHub #417).
    if (level !== 'all' && saved.level !== level) setLevel('all');
    setHighlight({ id: saved.id, label: isEdit ? '✓ Updated' : '✓ Just added' });
    setToastMessage(isEdit ? 'Changes saved.' : 'Prompt added to this catalog.');

    window.setTimeout(() => setToastMessage(null), TOAST_MS);
    window.setTimeout(() => setHighlight(null), HIGHLIGHT_MS);

    return { ok: true };
  }

  async function handleDeletePrompt(): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!token || !promptDeleteTarget) return { ok: false, error: 'Your session has expired. Please sign in again.' };

    // A 409 ("already used in a student session") arrives here with the route's own wording and
    // keeps the dialog open, which is what ConfirmModal's onConfirm contract is for.
    const result = await deleteUserStory(token, promptDeleteTarget.id);
    if (!result.ok) return { ok: false, error: result.error };

    const deletedId = promptDeleteTarget.id;
    setPrompts((current) => (current ?? []).filter((prompt) => prompt.id !== deletedId));
    setPromptDeleteTarget(null);
    setToastMessage('Prompt deleted.');
    window.setTimeout(() => setToastMessage(null), TOAST_MS);

    return { ok: true };
  }

  function handleDeleted(questionId: string) {
    setQuestions((current) => (current ?? []).filter((question) => question.id !== questionId));
    setDeleteTarget(null);
    setToastMessage('Question deleted.');
    window.setTimeout(() => setToastMessage(null), TOAST_MS);
  }

  async function handleSaveRatingPrompt(value: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!token) return { ok: false, error: 'Your session has expired. Please sign in again.' };

    const result = await updateRatingPrompt(token, params.activityType, value);
    if (!result.ok) return { ok: false, error: result.error };

    setQuiz((current) => (current ? { ...current, ratingPrompt: result.data.ratingPrompt } : current));
    setRatingPromptModalOpen(false);
    setToastMessage('Grading rubric updated.');
    window.setTimeout(() => setToastMessage(null), TOAST_MS);

    return { ok: true };
  }

  async function handleDeleteCatalog(): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!token) return { ok: false, error: 'Your session has expired. Please sign in again.' };

    // A 409 ("already used by a student") arrives here with the route's own wording and keeps
    // the dialog open, same contract as handleDeletePrompt above.
    const result = await deleteCatalog(token, params.activityType);
    if (!result.ok) return { ok: false, error: result.error };

    router.push('/instructor/quizzes');
    return { ok: true };
  }

  return (
    <AppShell active="instructor-quizzes">
      <div className="mx-auto max-w-3xl">
        <Link href="/instructor/quizzes" className="mb-4 inline-block text-xs font-bold text-gray-500 hover:text-brand-purple">
          ← Back to Question Catalogs
        </Link>

        {notFound ? (
          <p className="mt-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-4 text-sm font-semibold text-brand-danger-light">
            This catalog doesn&apos;t exist.
          </p>
        ) : forbidden ? (
          <p className="mt-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-4 text-sm font-semibold text-brand-danger-light">
            You don&apos;t have access to this catalog.
          </p>
        ) : loadFailed ? (
          <div className="mb-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-center">
            <p className="mb-4 text-sm font-semibold text-brand-danger">Failed to load this catalog.</p>
            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
              className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
            >
              Retry
            </button>
          </div>
        ) : !quiz || questions === null || prompts === null ? (
          <p className="mt-6 text-sm font-semibold text-gray-500">Loading…</p>
        ) : (
          <>
            <div className="mb-1 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">{quiz.name}</h1>
                <p className="max-w-2xl text-sm font-semibold text-gray-500">
                  {quiz.description ? `${quiz.description} · ` : ''}
                  {items.length} {llmGraded ? 'prompt' : 'question'}
                  {items.length === 1 ? '' : 's'} · by {quiz.authorName}
                </p>
              </div>
              <div className="flex flex-none items-center gap-2">
                {editMode ? (
                  <button
                    type="button"
                    onClick={() => (llmGraded ? setPromptModalState({ mode: 'add' }) : setModalState({ mode: 'add' }))}
                    className="flex items-center gap-2 rounded-full bg-brand-purple px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {llmGraded ? 'New Prompt' : 'New Question'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setEditMode((current) => !current)}
                  className={`rounded-full border px-5 py-2.5 text-sm font-extrabold transition ${
                    editMode
                      ? 'border-gray-300 bg-white text-gray-600 hover:border-brand-purple hover:text-brand-purple'
                      : 'border-brand-purple bg-white text-brand-purple hover:bg-brand-purple hover:text-white'
                  }`}
                >
                  {editMode ? 'Done' : 'Edit'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteCatalog(true)}
                  aria-label="Delete this catalog"
                  title="Delete this catalog"
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-brand-danger hover:text-brand-danger"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>

            {toastMessage ? (
              <div
                role="status"
                className="mb-5 mt-5 flex items-center gap-2.5 rounded-brand-md border border-brand-teal/40 bg-brand-teal/10 px-4 py-3 text-sm font-bold text-brand-teal-dark"
              >
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand-teal text-brand-teal-ink">
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                {toastMessage}
              </div>
            ) : null}

            {coverageGaps.length > 0 ? (
              <div className="mb-5 mt-5 rounded-brand-md border border-brand-gold/40 bg-brand-gold/10 px-4 py-3">
                <p className="text-sm font-bold text-brand-navy">
                  {coverageGaps.length === 3 ? 'No level' : `Level ${coverageGaps.join(' and ')}`}{' '}
                  {coverageGaps.length === 1 ? 'has' : 'have'} fewer than {STORIES_PER_SESSION} prompts.
                </p>
                <p className="mt-1 text-xs font-semibold text-gray-600">
                  A round draws {STORIES_PER_SESSION} prompts from a single level, so students can&apos;t start this
                  activity at {coverageGaps.length === 1 ? 'that level' : 'those levels'} until each has at least{' '}
                  {STORIES_PER_SESSION}.
                </p>
              </div>
            ) : null}

            {llmGraded ? (
              <div className="mb-6 mt-6 flex flex-wrap items-start justify-between gap-3 rounded-brand-lg border border-gray-100 bg-gray-50 p-4">
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-gray-400">Grading Rubric</p>
                  {quiz.ratingPrompt ? (
                    <p className="whitespace-pre-wrap text-sm font-medium text-gray-600">{quiz.ratingPrompt}</p>
                  ) : (
                    <p className="text-sm font-medium text-gray-400">Using the built-in default rubric.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setRatingPromptModalOpen(true)}
                  className="flex-none rounded-full border border-gray-300 bg-white px-4 py-1.5 text-xs font-extrabold text-gray-600 transition hover:border-brand-purple hover:text-brand-purple"
                >
                  {quiz.ratingPrompt ? 'Edit rubric' : 'Set rubric'}
                </button>
              </div>
            ) : null}

            {/* Catalog-level metadata, so it sits above the level filter rather than inside the
                filtered list — the ladder describes all three levels at once and filtering to one
                level must not hide the other two rungs. Read-only until the same Edit toggle that
                governs questions and prompts is on. */}
            <div className="mb-6 mt-6 rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Mastery titles</p>

              {editMode ? (
                <>
                  <p className="mb-3 mt-1.5 text-xs font-semibold text-gray-500">
                    What a student is called once they pass each level. Start typing to reuse a title
                    that already exists. Students who already passed a level get its title as soon as
                    you save.
                  </p>
                  <TitleLadderFields
                    draft={titleDraft}
                    onChange={(lvl, value) => setTitleDraft((current) => ({ ...current, [lvl]: value }))}
                    suggestions={titleSuggestions}
                    disabled={savingTitles}
                  />
                  {titleError ? <p className="mt-3 text-xs font-bold text-brand-danger">{titleError}</p> : null}
                  <button
                    type="button"
                    onClick={handleSaveTitles}
                    disabled={savingTitles}
                    className="mt-4 rounded-brand-md bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:opacity-60"
                  >
                    {savingTitles ? 'Saving…' : 'Save titles'}
                  </button>
                </>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {LEVEL_OPTIONS.filter((lvl): lvl is 1 | 2 | 3 => lvl !== 'all').map((lvl) => (
                    <div key={lvl} className="rounded-brand-md border border-gray-200 bg-white px-3.5 py-2.5">
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{LEVEL_LABEL[lvl]}</p>
                      <p
                        className={`mt-0.5 text-sm font-extrabold ${
                          titleDraft[lvl] ? 'text-brand-navy' : 'text-gray-400'
                        }`}
                      >
                        {titleDraft[lvl] || 'No title yet'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-6 mt-6 flex flex-wrap gap-1.5">
              {LEVEL_OPTIONS.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevel(lvl)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                    level === lvl
                      ? 'border-brand-purple bg-brand-purple text-white'
                      : 'border-gray-300 bg-white text-gray-600 hover:border-brand-purple hover:text-brand-purple'
                  }`}
                >
                  {lvl === 'all' ? 'All levels' : LEVEL_LABEL[lvl]}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {llmGraded ? (
                visiblePrompts.length === 0 ? (
                  <p className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6 text-center text-sm font-semibold text-gray-500">
                    No prompts yet at this level.
                  </p>
                ) : (
                  visiblePrompts.map((prompt) => (
                    <CatalogPromptCard
                      key={prompt.id}
                      prompt={prompt}
                      highlightLabel={prompt.id === highlight?.id ? highlight.label : null}
                      editable={editMode && prompt.ownerId === profile.user_id}
                      onEdit={() => setPromptModalState({ mode: 'edit', prompt })}
                      onDelete={() => setPromptDeleteTarget(prompt)}
                    />
                  ))
                )
              ) : visibleQuestions.length === 0 ? (
                <p className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6 text-center text-sm font-semibold text-gray-500">
                  No questions yet at this level.
                </p>
              ) : (
                visibleQuestions.map((question) => {
                  const isMine = question.ownerId === profile.user_id;
                  return (
                    <div
                      key={question.id}
                      className={`rounded-brand-lg border bg-gray-50 p-5 transition ${
                        question.id === highlight?.id ? 'border-brand-teal/50 ring-2 ring-brand-teal/30' : 'border-gray-100'
                      }`}
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-block rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-gray-500">
                            {LEVEL_LABEL[question.level]} · Level {question.level}
                          </span>
                          {question.id === highlight?.id ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-teal/20 px-2.5 py-1 text-[11px] font-extrabold text-brand-teal-dark">
                              {highlight.label}
                            </span>
                          ) : null}
                        </div>
                        {editMode && isMine ? (
                          <div className="flex flex-none items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setModalState({ mode: 'edit', question })}
                              aria-label="Edit this question"
                              title="Edit this question"
                              className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-brand-purple hover:text-brand-purple"
                            >
                              <EditIcon />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(question)}
                              aria-label="Delete this question"
                              title="Delete this question"
                              className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-brand-danger hover:text-brand-danger"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <p className="mb-4 text-sm font-bold text-brand-navy">{question.questionText}</p>
                      <div className="space-y-2">
                        {question.answerOptions.map((option) => (
                          <div
                            key={option.id}
                            className={`rounded-brand-md border p-3 ${
                              option.isCorrect ? 'border-brand-teal/40 bg-brand-teal/10' : 'border-gray-200 bg-white'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className={`text-sm font-semibold ${option.isCorrect ? 'text-brand-teal-dark' : 'text-gray-700'}`}>
                                {option.text}
                              </p>
                              {option.isCorrect ? (
                                <span className="flex-none rounded-full bg-brand-teal/20 px-2 py-0.5 text-[11px] font-extrabold text-brand-teal-dark">
                                  Correct
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-xs font-semibold text-gray-500">
                        <span className="font-extrabold text-gray-600">Explanation: </span>
                        {question.explanation}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {modalState ? (
        <QuestionFormModal
          mode={modalState.mode}
          initialData={modalState.mode === 'edit' ? modalState.question : undefined}
          defaultQuizType={params.activityType}
          defaultLevel={level === 'all' ? undefined : level}
          quizOptions={quizOptions}
          onClose={() => setModalState(null)}
          onSave={handleSaveQuestion}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteQuestionModal
          question={deleteTarget}
          token={token}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      ) : null}

      {promptModalState ? (
        <PromptFormModal
          mode={promptModalState.mode}
          initialData={promptModalState.mode === 'edit' ? promptModalState.prompt : undefined}
          defaultActivityType={params.activityType}
          defaultLevel={level === 'all' ? undefined : level}
          catalogOptions={quizOptions}
          onClose={() => setPromptModalState(null)}
          onSave={handleSavePrompt}
        />
      ) : null}

      {ratingPromptModalOpen ? (
        <RatingPromptModal
          mode="edit"
          initialValue={quiz?.ratingPrompt ?? ''}
          onCancel={() => setRatingPromptModalOpen(false)}
          onSave={handleSaveRatingPrompt}
        />
      ) : null}

      {/* ConfirmModal rather than a third hand-copy of DeleteQuestionModal — CLAUDE.md's shared
          confirmation dialog, which is what a new destructive flow should use. */}
      {promptDeleteTarget ? (
        <ConfirmModal
          kicker="LLM-Graded Task"
          title="Delete this prompt?"
          message={
            <>
              <span className="block font-bold text-brand-ink">{promptDeleteTarget.storyText}</span>
              <span className="mt-2 block">
                This removes the prompt from the catalog. Students who already answered it keep their
                submissions and scores.
              </span>
            </>
          }
          confirmLabel="Delete prompt"
          confirmingLabel="Deleting…"
          onClose={() => setPromptDeleteTarget(null)}
          onConfirm={handleDeletePrompt}
        />
      ) : null}

      {showDeleteCatalog ? (
        <ConfirmModal
          kicker="Question Catalogs"
          title="Delete this catalog?"
          message={
            <>
              <span className="block font-bold text-brand-ink">{quiz?.name ?? 'This catalog'}</span>
              <span className="mt-2 block">
                This permanently deletes every {llmGraded ? 'prompt' : 'question'} in this catalog and removes it
                from any quiz it&apos;s linked to. This can&apos;t be undone.
              </span>
            </>
          }
          confirmLabel="Delete catalog"
          confirmingLabel="Deleting…"
          onClose={() => setShowDeleteCatalog(false)}
          onConfirm={handleDeleteCatalog}
        />
      ) : null}
    </AppShell>
  );
}
