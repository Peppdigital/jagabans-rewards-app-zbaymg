import { useState, useEffect, useCallback } from 'react';

export interface CountdownValues {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  /** 0–100: percentage of the maintenance window elapsed */
  progress: number;
}

/**
 * @param targetDate  When the site reopens
 * @param startDate   When maintenance began (defaults to 24 h before targetDate)
 */
export function useCountdown(
  targetDate: Date,
  startDate?: Date,
): CountdownValues {
  const getTimeLeft = useCallback((): CountdownValues => {
    const now = Date.now();
    const target = targetDate.getTime();
    const start = startDate
      ? startDate.getTime()
      : target - 24 * 60 * 60 * 1000;

    const remaining = target - now;
    const elapsed = now - start;
    const duration = target - start;

    if (remaining <= 0) {
      return {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        isExpired: true,
        progress: 100,
      };
    }

    return {
      days: Math.floor(remaining / (1000 * 60 * 60 * 24)),
      hours: Math.floor((remaining / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((remaining / (1000 * 60)) % 60),
      seconds: Math.floor((remaining / 1000) % 60),
      isExpired: false,
      progress: Math.min(100, Math.max(0, (elapsed / duration) * 100)),
    };
  }, [targetDate, startDate]);

  const [timeLeft, setTimeLeft] = useState<CountdownValues>(getTimeLeft);

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, [getTimeLeft]);

  return timeLeft;
}
