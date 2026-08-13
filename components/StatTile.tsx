/**
 * One "where this student stands" number with its label.
 *
 * Lifted out of CompletedSessionsSummary so the public profile page can show a different subset
 * of tiles without either duplicating the markup or inheriting that component's fixed three —
 * one of which is "Sessions completed", a number a peer has no business seeing (see the privacy
 * contract in app/students/[id]/page.tsx).
 */
export function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-4 text-center">
      <div className="text-2xl font-extrabold tabular-nums text-brand-navy">{value.toLocaleString()}</div>
      <div className="mt-0.5 text-xs font-bold uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  );
}
