// Timestamps coming back from the API are not always self-describing.
//
// session_log.started_at/ended_at, submission.submitted_at and their siblings are declared
// `timestamp` in supabase/schema.sql — "timestamp WITHOUT time zone", so the column stores
// wall-clock digits and no offset. now() writes UTC into them (Supabase's session TimeZone),
// but PostgREST then serializes the value with nothing to say so: "2026-08-02T10:15:00".
//
// ECMAScript reads a date-*time* form without an offset as LOCAL time (only date-only forms
// default to UTC), so new Date() on that string lands one or two hours off in CET/CEST, and
// every toLocaleTimeString() downstream shows the wrong time.
//
// Known limitation: this fixes the symptom, not the cause. The columns are still zone-less, so
// any future query that hands a timestamp to the UI has to route it through toInstant() as
// well. The real fix is `timestamptz` in the schema, which would make this module unnecessary.

/** Trailing `Z`, `+02:00` or `+0200` — anything that already pins the value to an offset. */
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * Marks a zone-less API timestamp as UTC, which is what it actually is.
 *
 * Values that already carry an offset pass through untouched — lib/mockStudentAttempts.ts
 * builds its dates with toISOString(), and appending a second marker would corrupt them.
 */
export function toInstant(value: string): string {
  return HAS_OFFSET.test(value) ? value : `${value}Z`;
}
