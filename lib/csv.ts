// Minimal RFC 4180 CSV writer — the one bit of CSV logic the export route needs, kept in its own
// pure-helper file so it can be unit tested the way requireInstructor is (no vi.mock needed).

type CsvValue = string | number | boolean | null;

/**
 * Quotes a single cell only when it contains a comma, quote or newline — RFC 4180's minimal
 * escaping, not "quote everything". Internal quotes are doubled, the standard's escape for a
 * quote inside a quoted field.
 */
function csvCell(value: CsvValue): string {
  const text = value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Builds a full CSV document (header row + data rows) with CRLF line endings, per RFC 4180.
 * Every row must have the same length as headers — callers build rows positionally, mirroring
 * the header order, so a length mismatch would silently misalign columns rather than error.
 */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
