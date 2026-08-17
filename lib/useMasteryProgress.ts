'use client';

import { useCallback, useEffect, useState } from 'react';
import { buildMasteryTitleEntries, type MasteryTitleEntry } from './masteryTitles';
import { loadAvailableTitles, loadStudentScore, loadStudentTitles } from './sessionClient';

/**
 * The student's score plus their reconciled mastery ladder — lifted out of
 * components/MasteryProgressSection.tsx, which used to own this fetch privately.
 *
 * It had to move because two things on the profile page now need the same entries: the title
 * dropdown next to the student's name, and the mastery section further down. Both endpoints are
 * deliberately uncached (a just-earned title has to show immediately, see loadStudentTitles' own
 * comment), so letting each component fetch for itself would mean two of every request on every
 * mount. The page calls this once and passes the result to both.
 */
export function useMasteryProgress(token: string, studentId: string) {
  const [cumulativeScore, setCumulativeScore] = useState<number | null>(null);
  const [sessionsCompleted, setSessionsCompleted] = useState<number | null>(null);
  const [entries, setEntries] = useState<MasteryTitleEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const retry = useCallback(() => setLoadAttempt((count) => count + 1), []);

  // Hooks can't be called conditionally, so the caller passes empty strings for "nothing to load
  // yet" (profile still loading) or "not applicable" (an instructor, who has no mastery at all)
  // rather than skipping the call. Reporting loading: false for that case matters — otherwise the
  // profile page would render a mastery skeleton forever for an instructor.
  const enabled = token !== '' && studentId !== '';

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setError(null);

    Promise.all([
      // onRevalidate (GitHub #392 follow-up, same as UserProvider's own score load): corrects a
      // stale cached score in the background if the server disagrees, rather than leaving this
      // section stuck on a wrong number until the student finishes another session or logs out.
      loadStudentScore(token, studentId, {
        onRevalidate: (fresh) => {
          if (cancelled) return;
          setCumulativeScore(fresh.score);
          setSessionsCompleted(fresh.sessionsCompleted);
        },
      }),
      loadStudentTitles(token, studentId),
      loadAvailableTitles(token, studentId),
    ]).then(([scoreResult, titlesResult, availableResult]) => {
      if (cancelled) return;

      if (!scoreResult.ok) {
        setError(scoreResult.error);
        return;
      }
      if (!titlesResult.ok) {
        setError(titlesResult.error);
        return;
      }
      if (!availableResult.ok) {
        setError(availableResult.error);
        return;
      }

      setCumulativeScore(scoreResult.data.score);
      setSessionsCompleted(scoreResult.data.sessionsCompleted);
      setEntries(buildMasteryTitleEntries(availableResult.data.activities, titlesResult.data.titles));
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, token, studentId, loadAttempt]);

  return {
    entries,
    cumulativeScore,
    sessionsCompleted,
    error,
    loading: enabled && !error && entries === null,
    retry,
  };
}
