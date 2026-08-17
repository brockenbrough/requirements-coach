'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  addExtraQuestionsToQuiz,
  addExtraUserStoriesToQuiz,
  loadAllQuestionsForPicker,
  type PickableQuestion,
  type PickableUserStory,
} from '../lib/assembledQuizClient';
import type { GradingKind } from '../lib/activityTypes';
import { useModalDismiss } from './useModalDismiss';

const LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const ALL_CATALOGS = 'all';
const ALL_LEVELS = 'all';

function PickerRow({
  id,
  text,
  level,
  catalogName,
  typeLabel,
  alreadyIn,
  selected,
  onToggle,
}: {
  id: string;
  text: string;
  level: 1 | 2 | 3;
  catalogName: string;
  typeLabel: string;
  alreadyIn: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <li>
      <label className={`flex items-start gap-3 px-4 py-3 text-sm ${alreadyIn ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-brand-navy'}`}>
        <input
          type="checkbox"
          checked={alreadyIn || selected}
          disabled={alreadyIn}
          onChange={() => onToggle(id)}
          className="mt-0.5 h-4 w-4 flex-none rounded border-brand-navy-border text-brand-purple focus:ring-brand-purple"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-brand-ink">{text}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-brand-ink-muted">
            <span className="rounded-full bg-brand-purple/20 px-2 py-0.5 text-brand-purple">{typeLabel}</span>
            <span className="rounded-full bg-brand-navy px-2 py-0.5">{catalogName}</span>
            <span className="rounded-full bg-brand-navy px-2 py-0.5">{LEVEL_LABEL[level]}</span>
            {alreadyIn ? <span className="rounded-full bg-brand-teal/20 px-2 py-0.5 text-brand-teal-dark">Already in quiz</span> : null}
          </span>
        </span>
      </label>
    </li>
  );
}

/**
 * The popup that hand-picks individual questions or prompts onto an assembled quiz (GitHub #380,
 * extended with llm-graded parity), from any of the caller's own catalogs, without requiring that
 * catalog to be linked to the quiz as a whole — see assembled_quiz_extra_question/
 * assembled_quiz_extra_user_story's own header comments in supabase/schema.sql for why this is a
 * genuinely separate mechanism from "add a catalog". Same overlay/panel/header/footer chrome and
 * useModalDismiss wiring as CreateQuizModal/CreateCatalogModal.
 *
 * Fetches the whole picker list once (loadAllQuestionsForPicker, both pools) and
 * searches/filters it client-side, the same "fetch once, filter in the browser" choice
 * GET /api/instructor/quizzes' browse table already makes for catalogs — the picker route isn't
 * quiz-scoped, so `alreadyIncludedIds` (computed by the parent page from this quiz's own already-
 * loaded composition: active catalog items plus existing hand-picks, both kinds) is what marks a
 * row as already in the quiz, not anything the server returns.
 *
 * `gradingKind` is the quiz's own locked kind (assembled_quiz.grading_kind) — a quiz can never mix
 * kinds, so only the matching pool (questions for 'mcq', prompts for 'llm-graded') is ever fetched
 * into view, computed, or offered here; there is no Type filter, since there is only ever one type
 * to show. The other pool's endpoint (POST .../extra-questions vs. POST .../extra-user-stories) is
 * simply never called from this modal.
 *
 * onCreateNew is the second entry point into GitHub #380's "create a brand-new question/prompt"
 * flow — a "Can't find it? Create a new question/prompt" link rather than a full form embedded
 * here, since the actual form is the existing QuestionFormModal/PromptFormModal, owned and
 * rendered by the composition page itself (not this modal); triggering it means handing control
 * back to the parent, which closes this modal and opens that one. Optional so this component
 * doesn't require the capability if a future caller doesn't want it.
 */
export function AddQuizQuestionsModal({
  token,
  quizId,
  gradingKind,
  alreadyIncludedIds,
  onClose,
  onAdded,
  onCreateNew,
}: {
  token: string;
  quizId: string;
  gradingKind: GradingKind;
  alreadyIncludedIds: Set<string>;
  onClose: () => void;
  onAdded: (result: { questionIds: string[]; userStoryIds: string[] }) => void;
  onCreateNew?: () => void;
}) {
  const [questions, setQuestions] = useState<PickableQuestion[] | null>(null);
  const [userStories, setUserStories] = useState<PickableUserStory[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [catalogFilter, setCatalogFilter] = useState(ALL_CATALOGS);
  const [levelFilter, setLevelFilter] = useState<typeof ALL_LEVELS | 1 | 2 | 3>(ALL_LEVELS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { panelRef, firstFieldRef, requestClose } = useModalDismiss<HTMLDivElement, HTMLInputElement>({
    onClose,
    isBlocked: submitting,
  });

  useEffect(() => {
    let cancelled = false;
    loadAllQuestionsForPicker(token).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setQuestions(result.data.questions);
        setUserStories(result.data.userStories);
      } else {
        setLoadFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const catalogs = useMemo(() => {
    const seen = new Map<string, string>();
    if (gradingKind === 'mcq') {
      for (const question of questions ?? []) seen.set(question.catalogActivityType, question.catalogName);
    } else {
      for (const story of userStories ?? []) seen.set(story.catalogActivityType, story.catalogName);
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [questions, userStories, gradingKind]);

  const visibleQuestions = useMemo(() => {
    if (gradingKind !== 'mcq') return [];
    const q = query.trim().toLowerCase();
    return (questions ?? []).filter((question) => {
      if (q && !question.questionText.toLowerCase().includes(q)) return false;
      if (catalogFilter !== ALL_CATALOGS && question.catalogActivityType !== catalogFilter) return false;
      if (levelFilter !== ALL_LEVELS && question.level !== levelFilter) return false;
      return true;
    });
  }, [questions, query, catalogFilter, levelFilter, gradingKind]);

  const visibleUserStories = useMemo(() => {
    if (gradingKind !== 'llm-graded') return [];
    const q = query.trim().toLowerCase();
    return (userStories ?? []).filter((story) => {
      if (q && !story.storyText.toLowerCase().includes(q)) return false;
      if (catalogFilter !== ALL_CATALOGS && story.catalogActivityType !== catalogFilter) return false;
      if (levelFilter !== ALL_LEVELS && story.level !== levelFilter) return false;
      return true;
    });
  }, [userStories, query, catalogFilter, levelFilter, gradingKind]);

  function toggle(id: string) {
    if (alreadyIncludedIds.has(id)) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (selected.size === 0 || submitting) return;

    setSubmitting(true);
    setError('');

    const selectedQuestionIds = (questions ?? []).filter((question) => selected.has(question.id)).map((question) => question.id);
    const selectedUserStoryIds = (userStories ?? []).filter((story) => selected.has(story.id)).map((story) => story.id);

    const [questionResult, userStoryResult] = await Promise.all([
      selectedQuestionIds.length > 0
        ? addExtraQuestionsToQuiz(token, quizId, selectedQuestionIds)
        : Promise.resolve({ ok: true as const, data: { questionIds: [] as string[] } }),
      selectedUserStoryIds.length > 0
        ? addExtraUserStoriesToQuiz(token, quizId, selectedUserStoryIds)
        : Promise.resolve({ ok: true as const, data: { userStoryIds: [] as string[] } }),
    ]);

    setSubmitting(false);

    if (!questionResult.ok) {
      setError(questionResult.error);
      return;
    }
    if (!userStoryResult.ok) {
      setError(userStoryResult.error);
      return;
    }

    onAdded({ questionIds: questionResult.data.questionIds, userStoryIds: userStoryResult.data.userStoryIds });
    requestClose();
  }

  const loading = questions === null || userStories === null;
  const nothingVisible = !loading && visibleQuestions.length === 0 && visibleUserStories.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-quiz-questions-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-brand-lg border border-brand-navy-border bg-brand-navy p-7"
      >
        <div className="mb-5 flex flex-none items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand-gold">Quizzes</p>
            <h2 id="add-quiz-questions-title" className="mt-1 text-xl font-extrabold text-white">
              {gradingKind === 'llm-graded' ? 'Add Individual Prompts' : 'Add Individual Questions'}
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={submitting}
            aria-label="Close"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-brand-navy-border bg-brand-navy-2 text-brand-ink-muted transition hover:text-white disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="mb-4 flex flex-none flex-col gap-3 sm:flex-row">
          <label className="flex-1 text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
            Search
            <input
              ref={firstFieldRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={gradingKind === 'llm-graded' ? 'Search prompt text…' : 'Search question text…'}
              className="mt-1.5 block w-full rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple"
            />
          </label>

          <label className="text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
            Catalog
            <select
              value={catalogFilter}
              onChange={(event) => setCatalogFilter(event.target.value)}
              className="mt-1.5 block w-full rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple sm:w-44"
            >
              <option value={ALL_CATALOGS}>All catalogs</option>
              {catalogs.map(([activityType, name]) => (
                <option key={activityType} value={activityType}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
            Level
            <select
              value={levelFilter}
              onChange={(event) => setLevelFilter(event.target.value === ALL_LEVELS ? ALL_LEVELS : (Number(event.target.value) as 1 | 2 | 3))}
              className="mt-1.5 block w-full rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple sm:w-32"
            >
              <option value={ALL_LEVELS}>All levels</option>
              <option value={1}>Easy</option>
              <option value={2}>Medium</option>
              <option value={3}>Hard</option>
            </select>
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-brand-md border border-brand-navy-border bg-brand-navy-2">
          {loadFailed ? (
            <p className="p-4 text-center text-sm font-semibold text-brand-danger">Failed to load questions.</p>
          ) : loading ? (
            <p className="p-4 text-center text-sm font-semibold text-brand-ink-muted">Loading…</p>
          ) : nothingVisible ? (
            <p className="p-4 text-center text-sm font-semibold text-brand-ink-muted">
              {gradingKind === 'llm-graded' ? 'No prompts match this filter.' : 'No questions match this filter.'}
            </p>
          ) : (
            <>
              {visibleQuestions.length > 0 ? (
                <div>
                  <p className="sticky top-0 border-b border-brand-navy-border bg-brand-navy-2 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
                    Multiple Choice Questions ({visibleQuestions.length})
                  </p>
                  <ul className="divide-y divide-brand-navy-border">
                    {visibleQuestions.map((question) => (
                      <PickerRow
                        key={question.id}
                        id={question.id}
                        text={question.questionText}
                        level={question.level}
                        catalogName={question.catalogName}
                        typeLabel="MCQ"
                        alreadyIn={alreadyIncludedIds.has(question.id)}
                        selected={selected.has(question.id)}
                        onToggle={toggle}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}

              {visibleUserStories.length > 0 ? (
                <div>
                  <p className="sticky top-0 border-b border-brand-navy-border bg-brand-navy-2 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
                    LLM-Graded Prompts ({visibleUserStories.length})
                  </p>
                  <ul className="divide-y divide-brand-navy-border">
                    {visibleUserStories.map((story) => (
                      <PickerRow
                        key={story.id}
                        id={story.id}
                        text={story.storyText}
                        level={story.level}
                        catalogName={story.catalogName}
                        typeLabel="LLM-Graded"
                        alreadyIn={alreadyIncludedIds.has(story.id)}
                        selected={selected.has(story.id)}
                        onToggle={toggle}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>

        {error ? <p className="mt-3 flex-none text-xs font-bold text-brand-danger">{error}</p> : null}

        <div className="mt-6 flex flex-none flex-wrap items-center justify-between gap-3">
          {onCreateNew ? (
            <button
              type="button"
              onClick={onCreateNew}
              disabled={submitting}
              className="text-xs font-bold text-brand-purple underline-offset-2 transition hover:underline disabled:opacity-60"
            >
              {gradingKind === 'llm-graded' ? "Can't find it? Create a new prompt" : "Can't find it? Create a new question"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={requestClose}
              disabled={submitting}
              className="rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-4 py-2 text-sm font-extrabold text-brand-ink-muted transition hover:text-white disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={selected.size === 0 || submitting}
              className="rounded-brand-md bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? 'Adding…' : `Add ${selected.size} item${selected.size === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
