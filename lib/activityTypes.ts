// REQ-DL-1.1 / REQ-DL-3.1: activity_type is restricted to a known set of values.
// Kept in one place so routes and validation never drift apart.
//
// These strings must match question.activity_type in supabase/seed.sql —
// otherwise the session draw finds an empty pool and every start returns 400.
//
// Open point: the DB does not enforce this set yet. A lookup table with a
// foreign key from question.activity_type, or a Postgres enum, would keep
// schema and application code in sync.
export const ACTIVITY_TYPES = [
  'IDENTIFY_WEAK_USER_STORIES',
  'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA',
  'WRITE_ACCEPTANCE_CRITERIA',
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export function isActivityType(value: unknown): value is ActivityType {
  return typeof value === 'string' && (ACTIVITY_TYPES as readonly string[]).includes(value);
}
