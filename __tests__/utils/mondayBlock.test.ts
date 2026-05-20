import { isLosAngelesMonday, getOrderingStatus } from '../../utils/mondayBlock';

/**
 * Create a fake UTC Date whose LA wall-clock equals the given
 * dayOfWeek / hour / minute.  LA is UTC-8 (PST) in winter, UTC-7 (PDT) in
 * summer.  We use PST (-8) here to keep the math simple (winter dates).
 *
 * LA wall time = UTC time + offset → UTC time = LA wall time - offset
 * PST offset = -8, so UTC = LA + 8.
 */
function makeLADate(dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6, hour: number, minute = 0): Date {
  // Pick a known PST winter week: Mon 2025-01-06 is day 1
  // ISO week reference: 2025-01-06 (Mon) through 2025-01-12 (Sun)
  const mondayUTC = Date.UTC(2025, 0, 6, 8, 0, 0); // Mon 00:00 LA = 08:00 UTC
  const dayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Mon=0 offset
  const laWallMs = mondayUTC + dayOffset * 86_400_000 + (hour * 60 + minute) * 60_000;
  return new Date(laWallMs);
}

// Enable fake timers for the entire file so jest.setSystemTime works everywhere
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

// ── isLosAngelesMonday ───────────────────────────────────────────────────────

describe('isLosAngelesMonday', () => {
  it('returns true on a Monday in LA', () => {
    jest.setSystemTime(makeLADate(1, 12)); // Mon noon
    expect(isLosAngelesMonday()).toBe(true);
  });

  it('returns false on Tuesday in LA', () => {
    jest.setSystemTime(makeLADate(2, 12)); // Tue noon
    expect(isLosAngelesMonday()).toBe(false);
  });

  it('returns false on Sunday in LA', () => {
    jest.setSystemTime(makeLADate(0, 12)); // Sun noon
    expect(isLosAngelesMonday()).toBe(false);
  });
});

// ── getOrderingStatus ────────────────────────────────────────────────────────

describe('getOrderingStatus', () => {
  describe('Monday — always closed', () => {
    it('reports closed all day on Monday', () => {
      jest.setSystemTime(makeLADate(1, 14)); // Mon 2 PM
      const status = getOrderingStatus();
      expect(status.isOpen).toBe(false);
      expect(status.message).toMatch(/Monday/i);
      expect(status.message).toMatch(/Tuesday/i);
    });
  });

  describe('Tuesday–Friday ordering hours (opens 11:30 AM)', () => {
    it('is closed before 11:30 AM on Tuesday', () => {
      jest.setSystemTime(makeLADate(2, 10, 0)); // Tue 10:00 AM
      const status = getOrderingStatus();
      expect(status.isOpen).toBe(false);
      expect(status.message).toMatch(/11:30 AM/);
    });

    it('is closed at exactly 11:29 AM on Wednesday', () => {
      jest.setSystemTime(makeLADate(3, 11, 29));
      expect(getOrderingStatus().isOpen).toBe(false);
    });

    it('is open at 11:30 AM on Thursday', () => {
      jest.setSystemTime(makeLADate(4, 11, 30));
      expect(getOrderingStatus().isOpen).toBe(true);
    });

    it('is open at noon on Friday', () => {
      jest.setSystemTime(makeLADate(5, 12, 0));
      expect(getOrderingStatus().isOpen).toBe(true);
    });

    it('is open at 9:59 PM on Friday', () => {
      jest.setSystemTime(makeLADate(5, 21, 59));
      expect(getOrderingStatus().isOpen).toBe(true);
    });

    it('is closed at 10:00 PM on Tuesday', () => {
      jest.setSystemTime(makeLADate(2, 22, 0));
      const status = getOrderingStatus();
      expect(status.isOpen).toBe(false);
      expect(status.message).toMatch(/closed for the night/i);
    });
  });

  describe('Saturday–Sunday ordering hours (opens 1:30 PM)', () => {
    it('is closed before 1:30 PM on Saturday', () => {
      jest.setSystemTime(makeLADate(6, 13, 0)); // Sat 1:00 PM
      const status = getOrderingStatus();
      expect(status.isOpen).toBe(false);
      expect(status.message).toMatch(/1:30 PM/);
    });

    it('is closed at exactly 1:29 PM on Sunday', () => {
      jest.setSystemTime(makeLADate(0, 13, 29));
      expect(getOrderingStatus().isOpen).toBe(false);
    });

    it('is open at 1:30 PM on Saturday', () => {
      jest.setSystemTime(makeLADate(6, 13, 30));
      expect(getOrderingStatus().isOpen).toBe(true);
    });

    it('is open at 6 PM on Sunday', () => {
      jest.setSystemTime(makeLADate(0, 18, 0));
      expect(getOrderingStatus().isOpen).toBe(true);
    });

    it('is closed at 10:00 PM on Saturday', () => {
      jest.setSystemTime(makeLADate(6, 22, 0));
      const status = getOrderingStatus();
      expect(status.isOpen).toBe(false);
      expect(status.message).toMatch(/closed for the night/i);
    });
  });

  describe('closed message content', () => {
    it('includes the next open time in the closed-for-night message on Friday', () => {
      jest.setSystemTime(makeLADate(5, 23, 0)); // Fri 11 PM
      const status = getOrderingStatus();
      expect(status.isOpen).toBe(false);
      // Friday night → Saturday opens at 1:30 PM
      expect(status.message).toMatch(/1:30 PM/);
    });

    it('skips Monday in the next-day message when Sunday night', () => {
      jest.setSystemTime(makeLADate(0, 23, 0)); // Sun 11 PM
      const status = getOrderingStatus();
      expect(status.isOpen).toBe(false);
      // Sunday night → Tuesday (skips Monday)
      expect(status.message).toMatch(/Tuesday/i);
    });
  });
});
