'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getCumulativeScore, getHighestTitleOverall } from '../lib/activityStore';
import { clearStoredAccessToken } from '../lib/authClient';

type NavKey = 'dashboard' | 'activities' | 'profile';

const NAV_ITEMS: { key: NavKey; label: string; href: string }[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { key: 'activities', label: 'Activities', href: '/activities' },
  { key: 'profile', label: 'Profile', href: '/profile' },
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
  const [score, setScore] = useState(0);
  const [levelLine, setLevelLine] = useState('Getting started');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setScore(getCumulativeScore());
    const best = getHighestTitleOverall();
    setLevelLine(best ? best.title : 'Getting started');
  }, []);

  function handleLogout() {
    clearStoredAccessToken();
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
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-[#FFD666] bg-[#241f52] font-extrabold text-[#FFD666]">
            AS
          </div>
          <div className="text-sm font-extrabold text-white">Anna Student</div>
          <div className="mt-0.5 text-xs font-bold text-[#A79FC9]">{levelLine}</div>
        </div>

        <div className="mb-5 rounded-full bg-[#7C4DFF] px-4 py-1.5 text-center text-sm font-extrabold text-white">
          Score: {score.toLocaleString()}
        </div>

        <nav className="mb-5 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
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
          <span className="flex min-h-[44px] cursor-default items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-bold text-[#5c5480]">
            <GearIcon />
            Settings
          </span>
        </nav>

        <Link
          href="/activities"
          onClick={closeDrawer}
          className="mb-5 block min-h-[44px] w-full rounded-[10px] bg-[#2DD4BF] px-3 py-2.5 text-center text-sm font-extrabold leading-[1.6] text-[#04241f]"
        >
          Browse Activities
        </Link>

        <div className="flex gap-2">
          <span
            className="flex h-11 w-11 cursor-default items-center justify-center rounded-[9px] border border-[#332b6b] bg-[#241f52] text-[#A79FC9]"
            title="Settings"
          >
            <GearIcon />
          </span>
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
    </div>
  );
}
