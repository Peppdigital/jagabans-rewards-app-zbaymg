import { getTimeAgo } from '../../utils/timeUtils';

/** Returns an ISO string that is `seconds` in the past from now. */
function pastISO(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

describe('getTimeAgo', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  describe('just now (< 60 seconds)', () => {
    it('returns "just now" for 0 seconds ago', () => {
      const now = new Date('2025-05-20T12:00:00Z');
      jest.setSystemTime(now);
      expect(getTimeAgo(now.toISOString())).toBe('just now');
    });

    it('returns "just now" for 59 seconds ago', () => {
      const now = new Date('2025-05-20T12:00:00Z');
      jest.setSystemTime(now);
      const past = new Date(now.getTime() - 59_000).toISOString();
      expect(getTimeAgo(past)).toBe('just now');
    });
  });

  describe('minutes ago', () => {
    it('returns "1 minute ago" for exactly 60 seconds', () => {
      const now = new Date('2025-05-20T12:00:00Z');
      jest.setSystemTime(now);
      const past = new Date(now.getTime() - 60_000).toISOString();
      expect(getTimeAgo(past)).toBe('1 minute ago');
    });

    it('returns singular "1 minute ago"', () => {
      const now = new Date('2025-05-20T12:00:00Z');
      jest.setSystemTime(now);
      const past = new Date(now.getTime() - 90_000).toISOString();
      expect(getTimeAgo(past)).toBe('1 minute ago');
    });

    it('returns plural "30 minutes ago"', () => {
      const now = new Date('2025-05-20T12:00:00Z');
      jest.setSystemTime(now);
      const past = new Date(now.getTime() - 30 * 60_000).toISOString();
      expect(getTimeAgo(past)).toBe('30 minutes ago');
    });

    it('returns "59 minutes ago" just before one hour', () => {
      const now = new Date('2025-05-20T12:00:00Z');
      jest.setSystemTime(now);
      const past = new Date(now.getTime() - 59 * 60_000).toISOString();
      expect(getTimeAgo(past)).toBe('59 minutes ago');
    });
  });

  describe('hours ago', () => {
    it('returns "1 hour ago" for exactly 60 minutes', () => {
      const now = new Date('2025-05-20T12:00:00Z');
      jest.setSystemTime(now);
      const past = new Date(now.getTime() - 60 * 60_000).toISOString();
      expect(getTimeAgo(past)).toBe('1 hour ago');
    });

    it('returns plural "5 hours ago"', () => {
      const now = new Date('2025-05-20T12:00:00Z');
      jest.setSystemTime(now);
      const past = new Date(now.getTime() - 5 * 60 * 60_000).toISOString();
      expect(getTimeAgo(past)).toBe('5 hours ago');
    });

    it('returns "23 hours ago" just before one day', () => {
      const now = new Date('2025-05-20T12:00:00Z');
      jest.setSystemTime(now);
      const past = new Date(now.getTime() - 23 * 60 * 60_000).toISOString();
      expect(getTimeAgo(past)).toBe('23 hours ago');
    });
  });

  describe('days ago', () => {
    it('returns "1 day ago" for exactly 24 hours', () => {
      const now = new Date('2025-05-20T12:00:00Z');
      jest.setSystemTime(now);
      const past = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
      expect(getTimeAgo(past)).toBe('1 day ago');
    });

    it('returns "6 days ago" just before one week', () => {
      const now = new Date('2025-05-20T12:00:00Z');
      jest.setSystemTime(now);
      const past = new Date(now.getTime() - 6 * 24 * 60 * 60_000).toISOString();
      expect(getTimeAgo(past)).toBe('6 days ago');
    });
  });

  describe('weeks ago', () => {
    it('returns "1 week ago" for exactly 7 days', () => {
      const now = new Date('2025-05-20T12:00:00Z');
      jest.setSystemTime(now);
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString();
      expect(getTimeAgo(past)).toBe('1 week ago');
    });

    it('returns "3 weeks ago" for 21 days', () => {
      const now = new Date('2025-05-20T12:00:00Z');
      jest.setSystemTime(now);
      const past = new Date(now.getTime() - 21 * 24 * 60 * 60_000).toISOString();
      expect(getTimeAgo(past)).toBe('3 weeks ago');
    });
  });

  describe('months ago', () => {
    it('returns "1 month ago" for ~30 days', () => {
      const now = new Date('2025-05-20T12:00:00Z');
      jest.setSystemTime(now);
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString();
      expect(getTimeAgo(past)).toBe('1 month ago');
    });

    it('returns "6 months ago" for ~180 days', () => {
      const now = new Date('2025-05-20T12:00:00Z');
      jest.setSystemTime(now);
      const past = new Date(now.getTime() - 180 * 24 * 60 * 60_000).toISOString();
      expect(getTimeAgo(past)).toBe('6 months ago');
    });
  });

  describe('years ago', () => {
    it('returns "1 year ago" for ~365 days', () => {
      const now = new Date('2025-05-20T12:00:00Z');
      jest.setSystemTime(now);
      const past = new Date(now.getTime() - 365 * 24 * 60 * 60_000).toISOString();
      expect(getTimeAgo(past)).toBe('1 year ago');
    });

    it('returns "2 years ago" for ~730 days', () => {
      const now = new Date('2025-05-20T12:00:00Z');
      jest.setSystemTime(now);
      const past = new Date(now.getTime() - 730 * 24 * 60 * 60_000).toISOString();
      expect(getTimeAgo(past)).toBe('2 years ago');
    });
  });

  it('accepts a Date object as well as an ISO string', () => {
    const now = new Date('2025-05-20T12:00:00Z');
    jest.setSystemTime(now);
    const pastDate = new Date(now.getTime() - 5 * 60_000);
    expect(getTimeAgo(pastDate)).toBe('5 minutes ago');
  });
});
