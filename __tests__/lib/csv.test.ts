import { describe, expect, it } from 'vitest';
import { toCsv } from '../../lib/csv';

describe('toCsv', () => {
  it('joins headers and rows with commas and CRLF line endings', () => {
    const csv = toCsv(['a', 'b'], [['1', '2'], ['3', '4']]);
    expect(csv).toBe('a,b\r\n1,2\r\n3,4\r\n');
  });

  it('quotes a cell containing a comma, quote or newline, doubling internal quotes', () => {
    const csv = toCsv(['col'], [['has,comma'], ['has"quote'], ['has\nnewline']]);
    expect(csv).toBe('col\r\n"has,comma"\r\n"has""quote"\r\n"has\nnewline"\r\n');
  });

  it('renders null as an empty cell and leaves numbers/booleans unquoted', () => {
    const csv = toCsv(['a', 'b', 'c'], [[null, 1, true]]);
    expect(csv).toBe('a,b,c\r\n,1,true\r\n');
  });

  it('emits just a header row for an empty row set', () => {
    expect(toCsv(['a', 'b'], [])).toBe('a,b\r\n');
  });
});
