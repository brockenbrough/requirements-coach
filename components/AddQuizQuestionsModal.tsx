'use client';

import { useEffect, useMemo, useState } from 'react';
import { addExtraQuestionsToQuiz, loadAllQuestionsForPicker, type PickableQuestion } from '../lib/assembledQuizClient';
import { useModalDismiss } from './useModalDismiss';

const LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const ALL_CATALOGS = 'all';
const ALL_LEVELS = 'all';

/**
 * The popup that hand-picks individual questions onto an assembled quiz (GitHub #380), from any
 * catalog, without requiring that catalog to be linked to the quiz as a whole — see
 * assembled_quiz_extra_question's own header comment in supabase/schema.sql for why this is a
 * genuinely separate mechanism from "add a catalog". Same overlay/panel/header/footer chrome and
 * useModalDismiss wiring as CreateQuizModal/CreateCatalogModal.
 *
 * Fetches the whole system-wide question list once (loadAllQuestionsForPicker) and
 * searches/filters it client-side, the same "fetch once, filter in the browser" choice
 * GET /api/instructor/quizzes' browse table already makes for catalogs — the picker route isn't
 * quiz-scoped, so `alreadyIncludedIds` (computed by the parent page from this quiz's own already-
 * loaded composition: active catalog questions plus existing hand-picks) is what marks a row as
 * already in the quiz, not anything the server returns.
 *
 * Selecting several questions and submitting once calls POST .../extra-questions with the whole
 * batch — one round trip, not one per checkbox.
 *
 * onCreateNew is the second entry point into GitHub #380's "create a brand-new question" flow —
 * a "Can't find it? Create a new question" link rather than a full form embedded here, since the
 * actual form is the existing QuestionFormModal, owned and rendered by the composition page
 * itself (not this modal); triggering it means handing control back to the parent, which closes
 * this modal and opens that one. Optional so this component doesn't require the capability if a
 * future caller doesn't want it.
 */
export function AddQuizQuestionsModal({
  token,
  quizId,
  alreadyIncludedIds,
  onClose,
  onAdded,
  onCreateNew,
}: {
  token: string;
  quizId: string;
  alreadyIncludedIds: Set<string>;
  onClose: () => void;
  onAdded: (questionIds: string[]) => void;
  onCreateNew?: () => void;
}) {
  const [questions, setQuestions] = useState<PickableQuestion[] | null>(null);
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
      if (result.ok) setQuestions(result.data.questions);
      else setLoadFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const catalogs = useMemo(() => {
    const seen = new Map<string, string>();
    for (const question of questions ?? []) seen.set(question.catalogActivityType, question.catalogName);
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [questions]);

  const visibleQuestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (questions ?? []).filter((question) => {
      if (q && !question.questionText.toLowerCase().includes(q)) return false;
      if (catalogFilter !== ALL_CATALOGS && question.catalogActivityType !== catalogFilter) return false;
      if (levelFilter !== ALL_LEVELS && question.level !== levelFilter) return false;
      return true;
    });
  }, [questions, query, catalogFilter, levelFilter]);

  function toggle(questionId: string) {
    if (alreadyIncludedIds.has(questionId)) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }

  async function handleSubmit() {
    if (selected.size === 0 || submitting) return;

    setSubmitting(true);
    setError('');

    const result = await addExtraQuestionsToQuiz(token, quizId, Array.from(selected));
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onAdded(result.data.questionIds);
    requestClose();
  }

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
              Add Individual Questions
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
              placeholder="Search question text…"
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
          ) : questions === null ? (
            <p className="p-4 text-center text-sm font-semibold text-brand-ink-muted">Loading…</p>
          ) : visibleQuestions.length === 0 ? (
            <p className="p-4 text-center text-sm font-semibold text-brand-ink-muted">No questions match this filter.</p>
          ) : (
            <ul className="divide-y divide-brand-navy-border">
              {visibleQuestions.map((question) => {
                const alreadyIn = alreadyIncludedIds.has(question.id);
                const isSelected = selected.has(question.id);
                return (
                  <li key={question.id}>
                    <label
                      className={`flex items-start gap-3 px-4 py-3 text-sm ${alreadyIn ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-brand-navy'}`}
                    >
                      <input
                        type="checkbox"
                        checked={alreadyIn || isSelected}
                        disabled={alreadyIn}
                        onChange={() => toggle(question.id)}
                        className="mt-0.5 h-4 w-4 flex-none rounded border-brand-navy-border text-brand-purple focus:ring-brand-purple"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-brand-ink">{question.questionText}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-brand-ink-muted">
                          <span className="rounded-full bg-brand-navy px-2 py-0.5">{question.catalogName}</span>
                          <span className="rounded-full bg-brand-navy px-2 py-0.5">{LEVEL_LABEL[question.level]}</span>
                          {alreadyIn ? <span className="rounded-full bg-brand-teal/20 px-2 py-0.5 text-brand-teal-dark">Already in quiz</span> : null}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
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
              Can&apos;t find it? Create a new question
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
              {submitting ? 'Adding…' : `Add ${selected.size} question${selected.size === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
