/**
 * Returns true if the current moment is a Monday in Los Angeles local time.
 *
 * LA observes Pacific Time: PST (UTC-8) in winter, PDT (UTC-7) in summer.
 * React Native has no built-in timezone API, so we calculate DST manually
 * using the US rules: DST starts second Sunday of March, ends first Sunday of November.
 */
export function isLosAngelesMonday(): boolean {
  const nowUtc = new Date();
  const laOffsetHours = getLosAngelesUtcOffset(nowUtc);
  const laTime = new Date(nowUtc.getTime() + laOffsetHours * 60 * 60 * 1000);
  // getUTCDay() on the shifted date gives the LA local day-of-week
  return laTime.getUTCDay() === 1; // 0=Sun, 1=Mon, ...
}

/**
 * Returns the UTC offset in hours for Los Angeles at the given UTC Date.
 * -7 during PDT (Mar second Sun → Nov first Sun), -8 otherwise (PST).
 */
function getLosAngelesUtcOffset(utcDate: Date): number {
  const year = utcDate.getUTCFullYear();

  // DST start: 2:00 AM PST on the second Sunday of March
  // = second Sunday of March at 10:00 UTC
  const dstStart = nthSundayOfMonth(year, 2, 2); // month 2 = March (0-indexed)
  dstStart.setUTCHours(10, 0, 0, 0); // 02:00 PST = 10:00 UTC

  // DST end: 2:00 AM PDT on the first Sunday of November
  // = first Sunday of November at 09:00 UTC
  const dstEnd = nthSundayOfMonth(year, 10, 1); // month 10 = November (0-indexed)
  dstEnd.setUTCHours(9, 0, 0, 0); // 02:00 PDT = 09:00 UTC

  const isDst = utcDate >= dstStart && utcDate < dstEnd;
  return isDst ? -7 : -8;
}

/**
 * Returns the Date of the Nth Sunday of a given month/year (UTC midnight).
 * @param year  Full year
 * @param month Month index (0 = Jan, 2 = Mar, 10 = Nov)
 * @param nth   Which Sunday (1 = first, 2 = second, etc.)
 */
function nthSundayOfMonth(year: number, month: number, nth: number): Date {
  const firstDay = new Date(Date.UTC(year, month, 1));
  // Day of week of the 1st (0=Sun)
  const firstDow = firstDay.getUTCDay();
  // Days until first Sunday
  const daysToFirstSunday = (7 - firstDow) % 7;
  const dayOfMonth = 1 + daysToFirstSunday + (nth - 1) * 7;
  return new Date(Date.UTC(year, month, dayOfMonth));
}
