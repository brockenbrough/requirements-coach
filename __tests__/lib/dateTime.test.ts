import { describe, expect, it } from 'vitest';
import { toInstant } from '../../lib/dateTime';

describe('toInstant', () => {
  it('marks a zone-less PostgREST timestamp as UTC', () => {
    expect(toInstant('2026-08-02T10:15:00')).toBe('2026-08-02T10:15:00Z');
  });

  it('keeps fractional seconds intact', () => {
    expect(toInstant('2026-08-02T10:15:00.123456')).toBe('2026-08-02T10:15:00.123456Z');
  });

  it('leaves a value that already ends in Z alone', () => {
    // A value built with toISOString() already carries one; appending a second marker
    // would turn it into unparseable garbage.
    expect(toInstant('2026-08-02T10:15:00.000Z')).toBe('2026-08-02T10:15:00.000Z');
  });

  it('leaves an explicit offset alone, in both notations', () => {
    expect(toInstant('2026-08-02T12:15:00+02:00')).toBe('2026-08-02T12:15:00+02:00');
    expect(toInstant('2026-08-02T12:15:00+0200')).toBe('2026-08-02T12:15:00+0200');
    expect(toInstant('2026-08-02T06:15:00-04:00')).toBe('2026-08-02T06:15:00-04:00');
  });

  it('produces a value the browser reads as the UTC instant it actually is', () => {
    // The whole point: without the marker, a date-time form is parsed as *local* time, so this
    // assertion fails by the runner's UTC offset.
    expect(new Date(toInstant('2026-08-02T10:15:00')).toISOString()).toBe('2026-08-02T10:15:00.000Z');
  });
});
