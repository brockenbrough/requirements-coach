import type { MasteryTitleEntry } from '../lib/masteryTitles';
import { TitleProgressionTrack } from './TitleProgressionTrack';

/**
 * GitHub #39: one activity type's mastery standing — its current title (or "Not yet started")
 * and the full progression track toward the next one. Always rendered for every known activity
 * type, including ones the student has never attempted (see lib/masteryTitles.ts's own comment
 * on why that reconciliation happens client-side rather than in the API response).
 */
export function MasteryTitleCard({ entry }: { entry: MasteryTitleEntry }) {
  return (
    <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
      <p className="text-sm font-extrabold text-brand-navy">{entry.activityName}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-gray-400">
        {entry.currentTitle ? `${entry.currentTitle} · Level ${entry.currentLevel}` : 'Not yet started'}
      </p>
      <TitleProgressionTrack progression={entry.progression} currentLevel={entry.currentLevel} />
    </div>
  );
}
