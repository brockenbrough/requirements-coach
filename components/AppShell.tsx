'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getHighestTitleOverall } from '../lib/activityStore';
import { getInitials } from '../lib/initials';
import { loadStudentScore } from '../lib/sessionClient';
import { LLMProviderSettingsModal } from './LLMProviderSettingsModal';
import { useUser } from './UserProvider';

type NavKey = 'dashboard' | 'activities' | 'profile' | 'instructor' | 'instructor-questions' | 'instructor-settings' | 'instructor-ac';

const STUDENT_NAV_ITEMS: { key: NavKey; label: string; href: string }[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { key: 'activities', label: 'Activities', href: '/activities' },
  { key: 'profile', label: 'Profile', href: '/profile' },
];

// GitHub #82: instructors get a different set of destinations — no Dashboard/Activities, since
// those are the "take a quiz" flow instructors must not access, only Profile is shared.
//
// GitHub #150: 'instructor-settings' (LLM provider settings) is deliberately listed here too —
// one place owns its label/href, e.g. for the app/instructor/settings/page.tsx deep link — but
// it's filtered out of the rendered <nav> below (see visibleNavItems). The sidebar's gear icon
// opens LLMProviderSettingsModal directly instead of navigating there, per the issue's explicit
// ask not to add a fourth, separately-visible nav entry for it.
const INSTRUCTOR_NAV_ITEMS: { key: NavKey; label: string; href: string }[] = [
  { key: 'instructor', label: 'Instructor Dashboard', href: '/instructor' },
  { key: 'instructor-questions', label: 'Question Bank', href: '/instructor/questions' },
  { key: 'instructor-ac', label: 'AC Submissions', href: '/instructor/acceptance-criteria' },
  { key: 'profile', label: 'Profile', href: '/profile' },
  { key: 'instructor-settings', label: 'LLM Provider Settings', href: '/instructor/settings' },
];

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M4 5h16M4 12h16M4 19h10" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M2 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
      <path d="M16 8.5a3 3 0 1 0 0-6" />
      <path d="M18 14.5c2.6.5 4 2.1 4 5.5" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17Z" />
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.3.9a7 7 0 0 0-2.1-1.2L14 3h-4l-.5 2.5a7 7 0 0 0-2.1 1.2l-2.3-.9-2 3.5 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.3-.9c.6.5 1.3.9 2.1 1.2L10 21h4l.5-2.5a7 7 0 0 0 2.1-1.2l2.3.9 2-3.5-2-1.5c.1-.4.1-.8.1-1.2Z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

const NAV_ICONS: Record<NavKey, () => JSX.Element> = {
  dashboard: GridIcon,
  activities: ListIcon,
  profile: UserIcon,
  instructor: UsersIcon,
  'instructor-questions': BookIcon,
  'instructor-ac': PencilIcon,
  'instructor-settings': GearIcon,
};

export function AppShell({
  active,
  rightbar,
  children,
}: {
  active: NavKey;
  rightbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { token, profile, signOut } = useUser();
  const [score, setScore] = useState<number | null>(null);
  const [levelLine, setLevelLine] = useState('Getting started');
  const [drawerOpen, setDrawerOpen] = useState(false);
  // GitHub #150: the gear icon opens this instead of navigating for instructors.
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const isInstructor = profile?.role === 'instructor';
  const navItems = isInstructor ? INSTRUCTOR_NAV_ITEMS : STUDENT_NAV_ITEMS;
  // GitHub #150: 'instructor-settings' lives in INSTRUCTOR_NAV_ITEMS for its label/href, but is
  // reached via the gear icon below, not as a fifth item in the list itself.
  const visibleNavItems = navItems.filter((item) => item.key !== 'instructor-settings');

  // Score and mastery titles are a student concept — an instructor has neither, so there is
  // nothing to fetch or show under their avatar.
  useEffect(() => {
    if (isInstructor) return;
    const best = getHighestTitleOverall();
    setLevelLine(best ? best.title : 'Getting started');
  }, [isInstructor]);

  // AppShell is rendered by each page rather than by the layout, so this re-runs on every
  // navigation — returning from a finished activity picks up the new total by itself.
  const userId = profile?.user_id;

  useEffect(() => {
    if (!token || !userId || isInstructor) return;
    let cancelled = false;

    loadStudentScore(token, userId).then((result) => {
      if (cancelled) return;
      if (result.ok) setScore(result.data.score);
    });

    return () => {
      cancelled = true;
    };
  }, [token, userId, isInstructor]);

  function handleLogout() {
    signOut();
    router.push('/login');
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  return (
    <div className="min-h-screen bg-[#1b1642] lg:flex">
      <button
        onClick={() => setDrawerOpen(true)}
        aria-label="Open navigation"
        className="fixed left-4 top-4 z-30 flex h-11 w-11 items-center justify-center rounded-xl border border-[#332b6b] bg-[#241f52] text-white shadow-lg lg:hidden"
      >
        <HamburgerIcon />
      </button>

      {drawerOpen ? (
        <div onClick={closeDrawer} aria-hidden className="fixed inset-0 z-30 bg-black/60 lg:hidden" />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[80%] max-w-[280px] overflow-y-auto bg-[#1b1642] p-5 transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-60 lg:max-w-none lg:flex-none lg:translate-x-0 lg:border-r lg:border-[#332b6b] ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={closeDrawer}
          aria-label="Close navigation"
          className="mb-4 ml-auto flex h-9 w-9 items-center justify-center rounded-lg border border-[#332b6b] bg-[#241f52] text-white lg:hidden"
        >
          <CloseIcon />
        </button>

        <div className="mb-5 text-xl font-extrabold text-[#FFD666]">Requirements Coach</div>

        <div className="mb-4 text-center">
          {/*
            No identity is shown until a real profile is loaded — there is deliberately no
            "Guest" / "?" placeholder. Until then this looks identical to the loading state,
            covering both "still fetching" and "authenticated but no profile row yet", neither
            of which should imply an unauthenticated fallback identity.
          */}
          <div
            className={`mx-auto mb-2 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-[3px] border-brand-gold bg-brand-navy-2 font-extrabold text-brand-gold transition-opacity duration-300 ${
              profile ? 'opacity-100' : 'animate-pulse opacity-60'
            }`}
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : profile ? (
              <span>{getInitials(profile.first_name, profile.last_name, profile.username)}</span>
            ) : null}
          </div>
          <div
            className={`text-sm font-extrabold text-white transition-opacity duration-300 ${profile ? 'opacity-100' : 'opacity-0'}`}
          >
            {profile?.username}
          </div>
          {isInstructor ? (
            <div className="mt-0.5 text-xs font-bold uppercase tracking-wide text-[#FFD666]">Instructor</div>
          ) : (
            <div className="mt-0.5 text-xs font-bold text-[#A79FC9]">{levelLine}</div>
          )}
        </div>

        {/* A dash until the number is actually known: 0 is a real score for a new student,
            so showing it while loading would state something that may well be wrong. Score
            is a student concept, so an instructor doesn't get this pill at all. */}
        {isInstructor ? null : (
          <div className="mb-5 rounded-full bg-[#7C4DFF] px-4 py-1.5 text-center text-sm font-extrabold text-white">
            Score: {score === null ? '—' : score.toLocaleString()}
          </div>
        )}

        <nav className="mb-5 flex flex-col gap-1">
          {visibleNavItems.map((item) => {
            const Icon = NAV_ICONS[item.key];
            const isActive = active === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={closeDrawer}
                className={`flex min-h-[44px] items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-bold ${
                  isActive ? 'bg-[#7C4DFF] text-white' : 'text-[#A79FC9] hover:bg-[#241f52] hover:text-white'
                }`}
              >
                <Icon />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex gap-2">
          {/* GitHub #150: role-dependent behavior — instructors open the LLM provider settings
              modal; students have no settings surface yet, so this stays inert exactly as it
              already was, rather than opening something that doesn't exist. */}
          {isInstructor ? (
            <button
              type="button"
              onClick={() => {
                setSettingsModalOpen(true);
                closeDrawer();
              }}
              title="Settings"
              aria-label="Settings"
              className="flex h-11 w-11 items-center justify-center rounded-[9px] border border-[#332b6b] bg-[#241f52] text-[#A79FC9] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2DD4BF]"
            >
              <GearIcon />
            </button>
          ) : (
            <span
              className="flex h-11 w-11 cursor-default items-center justify-center rounded-[9px] border border-[#332b6b] bg-[#241f52] text-[#A79FC9]"
              title="Settings"
            >
              <GearIcon />
            </span>
          )}
          <button
            onClick={handleLogout}
            title="Log out"
            className="flex h-11 w-11 items-center justify-center rounded-[9px] border border-[#332b6b] bg-[#241f52] text-[#A79FC9] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2DD4BF]"
          >
            <LogoutIcon />
          </button>
        </div>
      </aside>

      <main className="min-h-screen flex-1 bg-white px-5 pb-10 pt-20 text-[#1B1642] lg:px-7 lg:py-9">{children}</main>

      {rightbar ? (
        <aside className="border-t border-[#332b6b] bg-[#1b1642] p-5 lg:w-60 lg:flex-none lg:border-l lg:border-t-0">
          {rightbar}
        </aside>
      ) : null}

      {/* GitHub #150: still gated on isInstructor here, not just on the gear button that opens
          it — the modal must not be openable for a student even in principle. */}
      {settingsModalOpen && isInstructor && token ? (
        <LLMProviderSettingsModal token={token} onClose={() => setSettingsModalOpen(false)} />
      ) : null}
    </div>
  );
}
