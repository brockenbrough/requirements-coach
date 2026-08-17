'use client';

import { useState } from 'react';
import { createAssembledQuiz } from '../lib/assembledQuizClient';
import type { CourseSummary } from '../lib/courseClient';
import type { QuizSummary } from '../lib/quizClient';
import { useModalDismiss } from './useModalDismiss';

/**
 * The popup that composes a quiz from one or more question catalogs for one of the instructor's
 * courses (GitHub #347/#360 follow-up), replacing the permanently visible inline form
 * app/instructor/assembled-quizzes/page.tsx used to render below the list. Structurally the same
 * shape as components/CreateCatalogModal.tsx (same overlay/panel/header/footer, same
 * useModalDismiss wiring) with two additional fields this quiz's composition needs and a catalog
 * has no use for: a course single-select and a catalog multi-select. `courses`/`catalogs` are
 * passed in rather than fetched here — the parent page already loads both for the list/table
 * view, and this modal only ever opens after that load has completed.
 */
export function CreateQuizModal({
  token,
  courses,
  catalogs,
  onClose,
  onCreated,
}: {
  token: string;
  courses: CourseSummary[];
  catalogs: QuizSummary[];
  onClose: () => void;
  /**
   * catalogNames travels alongside the created quiz because POST /api/instructor/assembled-quizzes
   * only echoes ids, not display names — the modal already has the mapping (via its own `catalogs`
   * prop) that the page's optimistic-insert row needs to render immediately.
   */
  onCreated: (quiz: { id: string; name: string; description: string | null; courseId: string; catalogs: { activityType: string; name: string }[]; catalogNames: string[] }) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [courseId, setCourseId] = useState('');
  const [selectedCatalogs, setSelectedCatalogs] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { panelRef, firstFieldRef, requestClose } = useModalDismiss<HTMLDivElement, HTMLInputElement>({
    onClose,
    isBlocked: submitting,
  });

  function toggleCatalog(activityType: string) {
    setSelectedCatalogs((current) =>
      current.includes(activityType) ? current.filter((id) => id !== activityType) : [...current, activityType],
    );
  }

  const canSubmit = Boolean(name.trim()) && Boolean(courseId) && selectedCatalogs.length > 0 && !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError('');

    const result = await createAssembledQuiz(token, {
      name: name.trim(),
      description: description.trim() || undefined,
      courseId,
      catalogActivityTypes: selectedCatalogs,
    });

    setSubmitting(false);

    if (!result.ok) {
      // A 409 name collision (activity_type's unique key, GitHub #347) lands here with the
      // route's own message — shown in place, not closed, so the instructor doesn't lose their
      // course/catalog selection over a name clash.
      setError(result.error);
      return;
    }

    const resolvedCatalogs = selectedCatalogs
      .map((activityType) => {
        const found = catalogs.find((c) => c.activityType === activityType);
        return found ? { activityType, name: found.name } : null;
      })
      .filter((c): c is { activityType: string; name: string } => c !== null);

    onCreated({ ...result.data.quiz, catalogs: resolvedCatalogs, catalogNames: resolvedCatalogs.map((c) => c.name) });
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
        aria-labelledby="create-quiz-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-brand-lg border border-brand-navy-border bg-brand-navy p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand-gold">Quizzes</p>
            <h2 id="create-quiz-title" className="mt-1 text-xl font-extrabold text-white">
              Create Quiz
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

        <form onSubmit={handleSubmit}>
          <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
            Name
            <input
              ref={firstFieldRef}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Sprint 1 Requirements Check"
              className="mt-1.5 block w-full rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple"
            />
          </label>

          <label className="mb-1.5 mt-4 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
            Description <span className="normal-case text-brand-ink-muted/70">(optional)</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is this quiz for?"
              rows={2}
              className="mt-1.5 block w-full resize-none rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple"
            />
          </label>

          <label className="mb-1.5 mt-4 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
            Course
            <select
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              className="mt-1.5 block w-full rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple"
            >
              <option value="">Select a course…</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>
          {courses.length === 0 ? (
            <p className="mt-1.5 text-xs font-semibold text-brand-ink-muted">
              You don&apos;t have any courses yet — create one on the Courses page first.
            </p>
          ) : null}

          <span className="mb-1.5 mt-4 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">Catalogs</span>
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-brand-md border border-brand-navy-border bg-brand-navy-2 p-3">
            {catalogs.length === 0 ? (
              <p className="text-xs font-semibold text-brand-ink-muted">No catalogs exist yet.</p>
            ) : (
              catalogs.map((catalog) => (
                <label key={catalog.activityType} className="flex items-center gap-2.5 text-sm font-semibold text-brand-ink">
                  <input
                    type="checkbox"
                    checked={selectedCatalogs.includes(catalog.activityType)}
                    onChange={() => toggleCatalog(catalog.activityType)}
                    className="h-4 w-4 rounded border-brand-navy-border text-brand-purple focus:ring-brand-purple"
                  />
                  {catalog.name}
                  <span className="text-xs font-semibold text-brand-ink-muted">({catalog.questionCount})</span>
                </label>
              ))
            )}
          </div>

          {error ? <p className="mt-3 text-xs font-bold text-brand-danger">{error}</p> : null}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={requestClose}
              disabled={submitting}
              className="rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-4 py-2 text-sm font-extrabold text-brand-ink-muted transition hover:text-white disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-brand-md bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
