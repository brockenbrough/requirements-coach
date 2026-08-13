'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { instructorTourSteps, studentTourSteps, type TourStep } from '../lib/onboardingTourSteps';
import { useUser } from './UserProvider';

type OnboardingTourContextValue = {
  active: boolean;
  step: TourStep | null;
  stepIndex: number;
  totalSteps: number;
  next: () => void;
  back: () => void;
  skip: () => void;
  /** Manually (re)starts the tour regardless of has_seen_onboarding_tour — the Profile page's "Show tour again". */
  startTour: () => void;
};

const OnboardingTourContext = createContext<OnboardingTourContextValue | null>(null);

/**
 * GitHub #318: drives the first-login guided tour — which step list to show (role-dependent),
 * where the user currently is in it, and persisting has_seen_onboarding_tour once the tour is
 * finished or skipped. Mounted in app/layout.tsx, next to and inside UserProvider (it reads the
 * signed-in profile via useUser()), so both AppShell (which renders the actual spotlight/tooltip
 * overlay — components/OnboardingTour.tsx — since it owns the sidebar DOM the tour highlights)
 * and page-level components like app/profile/page.tsx's "Show tour again" button can reach the
 * same tour state without either knowing about the other.
 */
export function OnboardingTourProvider({ children }: { children: React.ReactNode }) {
  const { token, profile, setProfile } = useUser();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Guards the automatic first-login start to at most once per signed-in user in this tab —
  // profile can re-render with a new object reference for unrelated reasons (an avatar upload,
  // an edited bio), and none of those should re-trigger the tour for an account that already
  // dismissed it earlier in the same session, before the PATCH below has round-tripped.
  const autoStartedFor = useRef<string | null>(null);

  const steps = profile?.role === 'instructor' ? instructorTourSteps : studentTourSteps;

  useEffect(() => {
    if (!profile || profile.has_seen_onboarding_tour) return;
    if (autoStartedFor.current === profile.user_id) return;
    autoStartedFor.current = profile.user_id;
    setStepIndex(0);
    setActive(true);
  }, [profile]);

  function persistSeen() {
    if (!token || !profile || profile.has_seen_onboarding_tour) return;
    setProfile({ ...profile, has_seen_onboarding_tour: true });
    fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ has_seen_onboarding_tour: true }),
    }).catch(() => {
      // Best-effort: worst case the tour offers itself again next login, which is a much
      // smaller problem than blocking the tour's close button on a settings write failing.
    });
  }

  function close() {
    setActive(false);
    persistSeen();
  }

  function next() {
    if (stepIndex >= steps.length - 1) {
      close();
      return;
    }
    setStepIndex((i) => i + 1);
  }

  function back() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  function startTour() {
    setStepIndex(0);
    setActive(true);
  }

  const value: OnboardingTourContextValue = {
    active,
    step: active ? steps[stepIndex] ?? null : null,
    stepIndex,
    totalSteps: steps.length,
    next,
    back,
    skip: close,
    startTour,
  };

  return <OnboardingTourContext.Provider value={value}>{children}</OnboardingTourContext.Provider>;
}

export function useOnboardingTour(): OnboardingTourContextValue {
  const ctx = useContext(OnboardingTourContext);
  if (!ctx) throw new Error('useOnboardingTour() must be used within <OnboardingTourProvider>.');
  return ctx;
}
