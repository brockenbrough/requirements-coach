'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { CourseSummary } from '../lib/courseClient';

function KebabIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  );
}

function ViewIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function DuplicateIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

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

/**
 * The kebab ("⋮") menu on the top-right corner of components/CourseCard.tsx (GitHub #363) — a
 * small popover, not a modal, so it doesn't use useModalDismiss (that hook's focus trap assumes
 * a full-screen overlay with its own backdrop; this is a few inches of dropdown anchored to a
 * button). Every action here reuses an existing handler/modal from the calling page — this
 * component only decides *when* to call them, never what they do.
 *
 * The trigger button and every menu item stopPropagation() on click so this menu can sit inside
 * (or visually over) a clickable card without ever triggering the card's own navigation — see
 * CourseCard's own docblock; its whole info area is a Link now, so this menu's actions would
 * otherwise fire a navigation alongside whatever they're actually meant to do.
 *
 * "View course" is a redundant-but-harmless convenience alongside the card's own navigation — kept
 * for a menu-driven navigation path that doesn't require finding the card body.
 */
export function CourseCardMenu({
  course,
  onDuplicate,
  onEdit,
  onDelete,
}: {
  course: CourseSummary;
  onDuplicate?: (course: CourseSummary) => void;
  onEdit?: (course: CourseSummary) => void;
  onDelete?: (course: CourseSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function runAction(action: (course: CourseSummary) => void) {
    setOpen(false);
    action(course);
  }

  const itemClassName =
    'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-semibold text-gray-700 transition hover:bg-gray-50 hover:text-brand-navy';

  return (
    <div ref={containerRef} className="relative" onClick={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        aria-label="Course actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55"
      >
        <KebabIcon />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={`${course.name} actions`}
          className="absolute right-0 top-9 z-10 w-44 overflow-hidden rounded-brand-md border border-gray-100 bg-white py-1 shadow-lg"
        >
          <Link
            href={`/instructor/courses/${encodeURIComponent(course.id)}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className={itemClassName}
          >
            <ViewIcon />
            View course
          </Link>
          {onDuplicate ? (
            <button type="button" role="menuitem" onClick={() => runAction(onDuplicate)} className={itemClassName}>
              <DuplicateIcon />
              Duplicate course
            </button>
          ) : null}
          {onEdit ? (
            <button type="button" role="menuitem" onClick={() => runAction(onEdit)} className={itemClassName}>
              <EditIcon />
              Edit
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(onDelete)}
              className={`${itemClassName} text-brand-danger hover:bg-brand-danger/10 hover:text-brand-danger`}
            >
              <TrashIcon />
              Delete course
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
