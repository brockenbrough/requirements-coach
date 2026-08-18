'use client';

import { useEffect, useState } from 'react';
import { loadQuizDetail, loadTitleNames, saveTitleLadder } from '../lib/quizClient';
import type { StoredTitleRung } from '../lib/titleAuthoringQueries';
import { emptyTitleLadderDraft, TitleLadderFields, titleLadderDraftToRungs, type TitleLadderDraft } from './TitleLadderFields';
import { useModalDismiss } from './useModalDismiss';

/** The stored ladder (only levels that have a title) widened into a full per-level form draft. */
function titleLadderToDraft(titles: StoredTitleRung[]): TitleLadderDraft {
  const draft = emptyTitleLadderDraft();
  for (const rung of titles) draft[rung.difficultyLevel] = rung.titleName;
  return draft;
}

/**
 * One catalog's mastery-title ladder, editable from wherever a catalog is reached — moved here
 * from app/instructor/quizzes/[activityType]/page.tsx's own inline section onto
 * app/instructor/assembled-quizzes/[quizId]/page.tsx instead, so titles are set from the quiz the
 * instructor is actually assembling for a course, one modal per linked catalog. Titles still
 * belong to the catalog (activity_type), not the quiz — PUT /api/instructor/quizzes/{activityType}/
 * titles is unchanged — this only relocates where the instructor opens that editor from.
 *
 * Unlike RatingPromptModal, which receives its initialValue from data the parent already loaded
 * (catalog.ratingPrompt lives on QuizCatalogComposition), there is no per-catalog title preview
 * loaded on the quiz page — fetching every linked catalog's ladder up front would mean one
 * GET /api/instructor/quizzes/{activityType} round trip per catalog before the page could render
 * anything. So this modal fetches its own initial ladder (plus the cross-catalog title-name
 * suggestion list) the moment it opens, the same "fetch once you actually need it" reasoning
 * QuestionFormModal and PromptFormModal already follow for their own option/level pickers.
 */
export function TitleLadderModal({
  token,
  activityType,
  catalogName,
  onClose,
  onSaved,
}: {
  token: string;
  activityType: string;
  catalogName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<TitleLadderDraft | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // No firstFieldRef target: the form's fields don't exist until the ladder finishes loading, so
  // there is nothing stable to focus at mount time the way every other modal here focuses an
  // always-present first field.
  const { panelRef, requestClose } = useModalDismiss<HTMLDivElement>({
    onClose,
    isBlocked: saving,
  });

  useEffect(() => {
    let cancelled = false;

    Promise.all([loadQuizDetail(token, activityType), loadTitleNames(token)]).then(([detailResult, namesResult]) => {
      if (cancelled) return;
      if (!detailResult.ok) {
        setLoadFailed(true);
        return;
      }
      setDraft(titleLadderToDraft(detailResult.data.titles));
      if (namesResult.ok) setSuggestions(namesResult.data.titleNames);
      // A failed suggestions fetch leaves the fields working as plain text inputs — same
      // "suggestions only" tolerance the catalog page's own version of this had.
    });

    return () => {
      cancelled = true;
    };
  }, [token, activityType]);

  async function handleSave() {
    if (!draft || saving) return;

    setSaving(true);
    setError('');

    const result = await saveTitleLadder(token, activityType, titleLadderDraftToRungs(draft));
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 py-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="title-ladder-modal-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-brand-lg border border-brand-navy-border bg-brand-navy p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand-gold">{catalogName}</p>
            <h2 id="title-ladder-modal-title" className="mt-1 text-xl font-extrabold text-white">
              Mastery Titles
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            aria-label="Close"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-brand-navy-border bg-brand-navy-2 text-brand-ink-muted transition hover:text-white disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {loadFailed ? (
          <p className="text-sm font-semibold text-brand-danger-light">Could not load this catalog&apos;s titles.</p>
        ) : !draft ? (
          <p className="text-sm font-semibold text-brand-ink-muted">Loading…</p>
        ) : (
          <>
            <p className="mb-4 text-xs font-semibold text-brand-ink-muted">
              What a student is called once they pass each level. Start typing to reuse a title that already
              exists. Students who already passed a level get its title as soon as you save.
            </p>
            <TitleLadderFields
              draft={draft}
              onChange={(lvl, value) => setDraft((current) => (current ? { ...current, [lvl]: value } : current))}
              suggestions={suggestions}
              disabled={saving}
              tone="dark"
            />
            {error ? <p className="mt-3 text-xs font-bold text-brand-danger">{error}</p> : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={requestClose}
                disabled={saving}
                className="rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-4 py-2 text-sm font-extrabold text-brand-ink-muted transition hover:text-white disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-brand-md bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save titles'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
