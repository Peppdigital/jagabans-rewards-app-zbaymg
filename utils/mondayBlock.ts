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

import type { StoreHours } from '@/services/supabaseService';

export interface OrderingStatus {
  isOpen: boolean;
  message: string;
}

const DAY_KEYS: (keyof StoreHours)[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = (h ?? 0) >= 12 ? 'PM' : 'AM';
  const hour12 = (h ?? 0) % 12 || 12;
  return (m ?? 0) === 0
    ? `${hour12} ${period}`
    : `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function nextOpenDay(storeHours: StoreHours, fromIndex: number): { label: string; openTime: string } {
  for (let i = 1; i <= 7; i++) {
    const idx = (fromIndex + i) % 7;
    const day = storeHours[DAY_KEYS[idx]];
    if (day.open) {
      const label = DAY_KEYS[idx].charAt(0).toUpperCase() + DAY_KEYS[idx].slice(1);
      return { label, openTime: day.openTime };
    }
  }
  return { label: 'soon', openTime: '' };
}

/**
 * Returns ordering status based on dynamic hours stored in app_config.
 */
export function getOrderingStatusFromConfig(storeHours: StoreHours): OrderingStatus {
  const laTime = getLosAngelesDate();
  const dayIndex = laTime.getUTCDay(); // 0=Sun … 6=Sat
  const todayKey = DAY_KEYS[dayIndex];
  const today = storeHours[todayKey];

  if (!today.open) {
    const next = nextOpenDay(storeHours, dayIndex);
    const timeStr = next.openTime ? ` at ${formatTime12h(next.openTime)}` : '';
    return {
      isOpen: false,
      message: `We're closed today. Ordering resumes ${next.label}${timeStr}.`,
    };
  }

  const now = laTime.getUTCHours() * 60 + laTime.getUTCMinutes();
  const openMin = parseTimeToMinutes(today.openTime);
  const closeMin = parseTimeToMinutes(today.closeTime);

  if (now < openMin) {
    return { isOpen: false, message: `Ordering opens at ${formatTime12h(today.openTime)}.` };
  }

  if (now >= closeMin) {
    const next = nextOpenDay(storeHours, dayIndex);
    const timeStr = next.openTime ? ` at ${formatTime12h(next.openTime)}` : '';
    return {
      isOpen: false,
      message: `We're closed for the night. Ordering resumes ${next.label}${timeStr}.`,
    };
  }

  return { isOpen: true, message: '' };
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
