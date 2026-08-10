'use client';

import { resultStateOf } from '../lib/activityLogTypes';
import type { StudentAttemptDetail } from '../lib/mockStudentAttempts';

const VIEW_WIDTH = 560;
const PLOT_LEFT = 4;
const PLOT_RIGHT = 556;
const PLOT_TOP = 10;
const PLOT_BOTTOM = 80;

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * GitHub #127: score trend over time. No chart library exists in this project yet (checked
 * package.json), and a handful of points doesn't need one — this is a plain inline SVG, same
 * approach the approved mockup used. If a fuller-featured library (e.g. Recharts) is wanted
 * instead, that's an `npm install` someone needs to approve; this component only reads
 * `attempts`, so swapping its internals wouldn't change how callers use it.
 */
export function StudentScoreChart({ attempts }: { attempts: StudentAttemptDetail[] }) {
  // Only finished attempts (completed or abandoned) have a real result to plot — an in-progress
  // attempt's partial score isn't comparable to a finished one's, same rule the mockup used.
  const finished = [...attempts]
    .filter((attempt) => attempt.status !== 'in-progress')
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

  if (finished.length === 0) {
    return (
      <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
        <p className="text-sm font-extrabold text-brand-navy">Score trend</p>
        <p className="mt-4 text-sm font-semibold text-gray-500">No finished attempts yet.</p>
      </div>
    );
  }

  const percentages = finished.map((attempt) => (attempt.maxScore > 0 ? (attempt.score / attempt.maxScore) * 100 : 0));

  const step = finished.length > 1 ? (PLOT_RIGHT - PLOT_LEFT) / (finished.length - 1) : 0;
  const points = percentages.map((pct, index) => ({
    x: PLOT_LEFT + step * index,
    y: PLOT_BOTTOM - (pct / 100) * (PLOT_BOTTOM - PLOT_TOP),
    abandoned: resultStateOf(finished[index]) === 'abandoned',
  }));

  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPoints = `${linePoints} ${PLOT_RIGHT},${PLOT_BOTTOM} ${PLOT_LEFT},${PLOT_BOTTOM}`;

  // "Trend" compares the average of the last 3 finished attempts against the first 3 — stable
  // even with only a handful of points, unlike a full linear regression over so little data.
  const windowSize = Math.min(3, Math.floor(finished.length / 2) || finished.length);
  const first = average(percentages.slice(0, windowSize));
  const last = average(percentages.slice(-windowSize));
  const delta = Math.round(last - first);
  const trendDirection = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';

  return (
    <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
      <p className="text-sm font-extrabold text-brand-navy">Score trend</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className={`text-2xl font-extrabold tabular-nums ${
            trendDirection === 'down' ? 'text-brand-danger' : trendDirection === 'up' ? 'text-brand-teal-dark' : 'text-brand-navy'
          }`}
        >
          {trendDirection === 'down' ? '↘' : trendDirection === 'up' ? '↗' : '→'} {delta > 0 ? '+' : ''}
          {delta}%
        </span>
      </div>
      {finished.length >= 2 ? (
        <p className="mb-3.5 mt-0.5 text-xs font-semibold text-gray-500">
          Last {windowSize} attempt{windowSize === 1 ? '' : 's'} ({Math.round(last)}%) vs. first {windowSize} ({Math.round(first)}%)
        </p>
      ) : (
        <p className="mb-3.5 mt-0.5 text-xs font-semibold text-gray-500">Only one finished attempt so far</p>
      )}

      <svg viewBox={`0 0 ${VIEW_WIDTH} 90`} width="100%" height="90" preserveAspectRatio="none">
        <defs>
          <linearGradient id="studentScoreTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7C4DFF" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#7C4DFF" stopOpacity="0" />
          </linearGradient>
        </defs>

        <polygon fill="url(#studentScoreTrendFill)" points={areaPoints} />
        <polyline fill="none" stroke="#7C4DFF" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" points={linePoints} />

        {points.map((p, index) => (
          <circle key={finished[index].id} cx={p.x} cy={p.y} r={3.5} fill={p.abandoned ? '#ff6b57' : '#2DD4BF'} stroke="#fff" strokeWidth={1.5} />
        ))}
      </svg>
      <p className="mt-1.5 text-xs font-semibold text-gray-500">
        {new Date(finished[0].dateTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} →{' '}
        {new Date(finished[finished.length - 1].dateTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · red dot = abandoned
        attempt
      </p>
    </div>
  );
}
