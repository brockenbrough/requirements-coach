/**
 * Fallback-avatar initials for a display name.
 * "Anna Student" -> "AS" (first letter of first + last word).
 * "annelin"      -> "AN" (first two letters of the single word).
 */
export function getInitials(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  const first = parts[0]?.[0] ?? '';
  const last = parts[parts.length - 1]?.[0] ?? '';
  return (first + last).toUpperCase();
}
