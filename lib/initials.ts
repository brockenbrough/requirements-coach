/**
 * Fallback-avatar initials.
 * Prefers first/last name: "Anna" + "Student" -> "AS".
 * Falls back to the old single-name heuristic (e.g. the username) when
 * first/last name aren't set yet: "Anna Student" -> "AS", "annelin" -> "AN".
 */
export function getInitials(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallbackName?: string | null
): string {
  const first = (firstName ?? '').trim();
  const last = (lastName ?? '').trim();

  if (first || last) {
    const combined = `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
    if (combined) return combined;
  }

  return initialsFromSingleName(fallbackName);
}

function initialsFromSingleName(name: string | null | undefined): string {
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
