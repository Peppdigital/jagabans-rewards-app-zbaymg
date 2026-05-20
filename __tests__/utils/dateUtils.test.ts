import { formatLocalDate } from '../../utils/dateUtils';

describe('formatLocalDate', () => {
  it('formats a standard date in en-US locale', () => {
    // YYYY-MM-DD → M/D/YYYY in en-US default
    expect(formatLocalDate('2025-05-20')).toBe('5/20/2025');
  });

  it('formats January 1st correctly', () => {
    expect(formatLocalDate('2025-01-01')).toBe('1/1/2025');
  });

  it('formats December 31st correctly', () => {
    expect(formatLocalDate('2025-12-31')).toBe('12/31/2025');
  });

  it('handles leap year Feb 29', () => {
    expect(formatLocalDate('2024-02-29')).toBe('2/29/2024');
  });

  it('accepts Intl.DateTimeFormatOptions to change output format', () => {
    const result = formatLocalDate('2025-05-20', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    expect(result).toBe('May 20, 2025');
  });

  it('accepts short month format', () => {
    const result = formatLocalDate('2025-03-15', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    expect(result).toBe('Mar 15, 2025');
  });

  it('does NOT shift to the previous day due to UTC parsing', () => {
    // A naive `new Date("2025-01-15")` interprets as UTC midnight,
    // which in UTC-N timezones would render as Jan 14.
    // formatLocalDate must avoid this by constructing with local constructor.
    const result = formatLocalDate('2025-01-15');
    expect(result).toBe('1/15/2025');
  });

  it('handles single-digit month and day', () => {
    expect(formatLocalDate('2025-03-07')).toBe('3/7/2025');
  });
});
