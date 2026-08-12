import { getInitials } from '../lib/initials';

/**
 * The round avatar-or-initials circle used on the app's dark surfaces. Extracted because the
 * same markup had already been copy-pasted into AppShell.tsx and StudentDetailHeader.tsx, and
 * the leaderboard would have been a third copy.
 *
 * Deliberately NOT used by app/profile/page.tsx: that one is a <button> wrapping an upload flow
 * with a hover overlay and a light-surface border, not a display avatar — folding it in here
 * would mean a `tone` prop plus an `as` prop to serve one call site.
 *
 * Sizes are a fixed set rather than a free className so the call sites can't drift back into
 * three slightly different circles. className is still open for per-site extras (AppShell's
 * loading pulse), not for overriding the shape.
 */
const SIZES = {
  sm: 'h-9 w-9 text-[11px] border-2',
  md: 'h-14 w-14 text-lg border-[3px]',
  lg: 'h-16 w-16 text-base border-[3px]',
} as const;

export function Avatar({
  avatarUrl,
  firstName,
  lastName,
  fallbackName,
  size = 'md',
  className = '',
}: {
  avatarUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Used for initials when first/last name aren't available — typically the username. */
  fallbackName?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  // With no url and no name at all, the circle stays empty rather than falling back to
  // getInitials' "?" placeholder. That is what lets AppShell render this while the profile is
  // still loading: its comment there is explicit that there must be no guest/"?" identity, and
  // an empty circle reads the same as the loading state it already had.
  const hasName = Boolean(firstName || lastName || fallbackName);

  return (
    <span
      className={`flex flex-none items-center justify-center overflow-hidden rounded-full border-brand-gold bg-brand-navy-2 font-extrabold text-brand-gold ${SIZES[size]} ${className}`}
    >
      {avatarUrl ? (
        // alt="" — the username is always rendered next to the avatar, so announcing it twice
        // would just be noise for a screen reader.
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : hasName ? (
        <span>{getInitials(firstName, lastName, fallbackName)}</span>
      ) : null}
    </span>
  );
}
