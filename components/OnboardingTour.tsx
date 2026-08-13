'use client';

import { useEffect, useState } from 'react';
import { useOnboardingTour } from './OnboardingTourProvider';

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_WIDTH = 200;
// A narrower box wraps the longest description (the Courses step, ~155 characters) into more
// lines than before, which roughly cancels out the smaller padding below — kept generous rather
// than tuned to the shortest description, since this is only a clamp/side-selection estimate,
// not an exact layout (see computeTooltipPosition's own comment).
const TOOLTIP_HEIGHT_ESTIMATE = 150;
// Also the gap between the spotlight and the tooltip — a smaller value keeps the two visually
// as one compact unit instead of looking like two separate floating pieces.
const MARGIN = 10;
// Tailwind's `md` breakpoint — below it the sidebar is the mobile off-canvas drawer, where a
// tooltip to the right of a nav item would mostly land off-screen.
const NARROW_VIEWPORT_PX = 768;

type Position = { top: number; left: number };

/**
 * Picks a side for the tooltip with a same-axis fallback if there's no room: below the target
 * on narrow viewports (right would overflow off-screen past the drawer), to its right on wider
 * ones (below would sit awkwardly under a short sidebar item). Clamped to stay on screen either
 * way, using TOOLTIP_HEIGHT_ESTIMATE rather than a measured height — simple on purpose; a few
 * px of slack around the estimate is a fine trade for not needing a second measure-then-render
 * pass just to position a tooltip.
 */
function computeTooltipPosition(rect: DOMRect): Position {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (vw < NARROW_VIEWPORT_PX) {
    const spaceBelow = vh - rect.bottom;
    const top =
      spaceBelow >= TOOLTIP_HEIGHT_ESTIMATE + MARGIN * 2
        ? rect.bottom + MARGIN
        : Math.max(MARGIN, rect.top - TOOLTIP_HEIGHT_ESTIMATE - MARGIN);
    const left = Math.min(Math.max(MARGIN, rect.left), vw - TOOLTIP_WIDTH - MARGIN);
    return { top, left: Math.max(MARGIN, left) };
  }

  const spaceRight = vw - rect.right;
  const left =
    spaceRight >= TOOLTIP_WIDTH + MARGIN * 2
      ? rect.right + MARGIN
      : Math.max(MARGIN, rect.left - TOOLTIP_WIDTH - MARGIN);
  const top = Math.min(Math.max(MARGIN, rect.top), vh - TOOLTIP_HEIGHT_ESTIMATE - MARGIN);
  return { top: Math.max(MARGIN, top), left };
}

/**
 * GitHub #318: the first-login guided tour's spotlight + tooltip. Mounted inside AppShell (the
 * only place the data-tour targets it looks up actually exist in the DOM), driven entirely by
 * OnboardingTourProvider — this component owns positioning and rendering only, no tour state.
 *
 * No tour library: positioning is plain getBoundingClientRect(), re-measured on resize/scroll.
 * The spotlight "cutout" is a fixed box the size of the target plus padding given a large
 * box-shadow (a common CSS-only spotlight technique) rather than an SVG mask — simpler for a
 * single always-one-target-at-a-time highlight than building and updating a mask path.
 */
export function OnboardingTour() {
  const { active, step, stepIndex, totalSteps, next, back, skip } = useOnboardingTour();
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!active || !step) {
      setRect(null);
      return;
    }

    function measure() {
      const el = document.querySelector(`[data-tour="${step!.target}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      setRect(el.getBoundingClientRect());
    }

    measure();
    // AppShell's mobile drawer (opened for the tour if it wasn't already) animates open over
    // ~200ms — an immediate measurement can land mid-transition, so this catches the settled
    // position shortly after.
    const timeout = window.setTimeout(measure, 250);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, step]);

  useEffect(() => {
    if (!active) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') skip();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active, skip]);

  if (!active || !step || !rect) return null;

  const tooltipPosition = computeTooltipPosition(rect);
  const isLastStep = stepIndex === totalSteps - 1;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={`Guided tour: ${step.title}`}>
      {/* The spotlight: a transparent box the target's size, whose oversized box-shadow darkens
          everything else on screen. transition-all lets it glide to the next target on Back/Next
          instead of jump-cutting. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed rounded-brand-md ring-2 ring-brand-purple transition-all duration-200"
        style={{
          top: rect.top - SPOTLIGHT_PADDING,
          left: rect.left - SPOTLIGHT_PADDING,
          width: rect.width + SPOTLIGHT_PADDING * 2,
          height: rect.height + SPOTLIGHT_PADDING * 2,
          boxShadow: '0 0 0 9999px rgba(15, 10, 40, 0.75)',
        }}
      />

      {/*
        Deliberately closer to a popover than a card/panel: rounded-brand-md (10px, the
        inputs/buttons/nav-item radius per CLAUDE.md) rather than rounded-brand-lg (20px, the
        card/panel radius) is part of that — the earlier pass kept the panel radius, which read
        as "small modal" rather than "tooltip" even after the padding/font pass.
      */}
      <div
        className="fixed w-[200px] max-w-[calc(100vw-2rem)] rounded-brand-md bg-white p-1.5 shadow-2xl transition-all duration-200"
        style={{ top: tooltipPosition.top, left: tooltipPosition.left }}
      >
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-brand-purple">
            Step {stepIndex + 1} of {totalSteps}
          </span>
          <button
            type="button"
            onClick={skip}
            className="text-[10px] font-bold text-gray-400 transition hover:text-brand-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-purple"
          >
            Skip tour
          </button>
        </div>

        {/* Title/description stay at text-xs (12px) — the smallest step on Tailwind's default
            scale — rather than shrinking further like the chrome above: this is the tour's
            actual content, and 12px is a reasonable floor for body text legibility.
            leading-snug (instead of the default leading-normal) keeps wrapped lines close
            together so the box hugs the text instead of trailing extra line-height as blank
            space. */}
        <h2 className="text-xs font-extrabold leading-snug text-brand-navy">{step.title}</h2>
        <p className="text-xs font-semibold leading-snug text-gray-500">{step.description}</p>

        <div className="mt-1 flex items-center justify-between gap-1.5">
          <div className="flex gap-1" aria-hidden="true">
            {Array.from({ length: totalSteps }, (_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === stepIndex ? 'bg-brand-purple' : 'bg-gray-200'}`} />
            ))}
          </div>

          <div className="flex gap-1">
            {stepIndex > 0 ? (
              <button
                type="button"
                onClick={back}
                className="rounded-brand-md border border-gray-200 bg-white px-2 py-0.5 text-xs font-bold text-gray-600 transition hover:border-gray-300"
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={next}
              className="rounded-brand-md bg-brand-purple px-2 py-0.5 text-xs font-extrabold text-white transition hover:bg-brand-purple-dark"
            >
              {isLastStep ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
