/**
 * Ordering hours utilities for Los Angeles local time.
 *
 * Kitchen hours:
 *   Tuesday–Friday  12:00 noon – 10:00 PM
 *   Saturday–Sunday  2:00 PM   – 10:00 PM
 *   Monday           Closed
 *
 * Ordering is accepted 30 minutes before kitchen opening time.
 */

export interface OrderingStatus {
  isOpen: boolean;
  message: string;
}

/**
 * Returns true if the current moment is a Monday in Los Angeles local time.
 * Kept for backward-compatibility with screens that only need the Monday check.
 */
export function isLosAngelesMonday(): boolean {
  const laTime = getLosAngelesDate();
  return laTime.getUTCDay() === 1;
}

/**
 * Returns whether online ordering is currently open, plus a human-readable
 * status message when closed.
 */
export function getOrderingStatus(): OrderingStatus {
  const laTime = getLosAngelesDate();
  const day = laTime.getUTCDay(); // 0=Sun 1=Mon 2=Tue … 6=Sat
  const totalMinutes = laTime.getUTCHours() * 60 + laTime.getUTCMinutes();

  const CLOSE_TIME = 22 * 60; // 10:00 PM

  // Monday: closed all day
  if (day === 1) {
    return {
      isOpen: false,
      message: "We're closed today (Monday). Ordering resumes Tuesday at 11:30 AM.",
    };
  }

  // Tue–Fri: ordering opens at 11:30 AM (30 min before noon kitchen open)
  // Sat–Sun: ordering opens at 1:30 PM (30 min before 2 PM kitchen open)
  const isTueFri = day >= 2 && day <= 5;
  const openTime = isTueFri ? 11 * 60 + 30 : 13 * 60 + 30;

  if (totalMinutes < openTime) {
    const label = isTueFri ? '11:30 AM' : '1:30 PM';
    return { isOpen: false, message: `Ordering opens at ${label}.` };
  }

  if (totalMinutes >= CLOSE_TIME) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let nextDay = (day + 1) % 7;
    if (nextDay === 1) nextDay = 2; // skip Monday
    const nextLabel = (nextDay >= 2 && nextDay <= 5) ? '11:30 AM' : '1:30 PM';
    return {
      isOpen: false,
      message: `We're closed for the night. Ordering resumes ${dayNames[nextDay]} at ${nextLabel}.`,
    };
  }

  return { isOpen: true, message: '' };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns a Date whose UTC fields represent the current wall-clock time in LA.
 */
function getLosAngelesDate(): Date {
  const nowUtc = new Date();
  const offsetHours = getLosAngelesUtcOffset(nowUtc);
  return new Date(nowUtc.getTime() + offsetHours * 60 * 60 * 1000);
}

/**
 * Returns the UTC offset in hours for Los Angeles at the given UTC Date.
 * -7 during PDT (second Sun of Mar → first Sun of Nov), -8 otherwise (PST).
 */
function getLosAngelesUtcOffset(utcDate: Date): number {
  const year = utcDate.getUTCFullYear();

  const dstStart = nthSundayOfMonth(year, 2, 2);
  dstStart.setUTCHours(10, 0, 0, 0); // 02:00 PST = 10:00 UTC

  const dstEnd = nthSundayOfMonth(year, 10, 1);
  dstEnd.setUTCHours(9, 0, 0, 0); // 02:00 PDT = 09:00 UTC

  return utcDate >= dstStart && utcDate < dstEnd ? -7 : -8;
}

/**
 * Returns the Date of the Nth Sunday of a given month/year (UTC midnight).
 */
function nthSundayOfMonth(year: number, month: number, nth: number): Date {
  const firstDay = new Date(Date.UTC(year, month, 1));
  const firstDow = firstDay.getUTCDay();
  const daysToFirstSunday = (7 - firstDow) % 7;
  const dayOfMonth = 1 + daysToFirstSunday + (nth - 1) * 7;
  return new Date(Date.UTC(year, month, dayOfMonth));
}
