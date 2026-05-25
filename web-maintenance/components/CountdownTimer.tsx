'use client';

import { motion, AnimatePresence } from 'framer-motion';

// ─── FlipUnit ────────────────────────────────────────────────────────────────

interface FlipUnitProps {
  value: number;
  label: string;
}

function FlipUnit({ value, label }: FlipUnitProps) {
  const display = String(value).padStart(2, '0');

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Card */}
      <div
        className="relative overflow-hidden flex items-center justify-center"
        style={{
          width: 'clamp(64px, 14vw, 84px)',
          height: 'clamp(64px, 14vw, 84px)',
          background:
            'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(201,169,110,0.18)',
          borderRadius: '10px',
          boxShadow:
            '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* Center divider line */}
        <div
          className="absolute inset-x-0 z-10"
          style={{
            top: '50%',
            height: '1px',
            background: 'rgba(0,0,0,0.4)',
          }}
        />
        {/* Top half gloss */}
        <div
          className="absolute inset-x-0 top-0 z-0"
          style={{
            height: '50%',
            background:
              'linear-gradient(to bottom, rgba(255,255,255,0.03), transparent)',
          }}
        />
        {/* Number */}
        <AnimatePresence mode="popLayout">
          <motion.span
            key={display}
            className="relative z-20 tabular-nums font-light select-none"
            style={{
              fontFamily: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
              fontSize: 'clamp(26px, 6vw, 38px)',
              color: '#D4AF70',
              textShadow:
                '0 0 24px rgba(212,175,112,0.6), 0 0 48px rgba(212,175,112,0.2)',
              letterSpacing: '0.04em',
            }}
            initial={{ y: '-110%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            exit={{ y: '110%', opacity: 0 }}
            transition={{
              duration: 0.38,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {display}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Label */}
      <span
        className="uppercase font-light tracking-widest"
        style={{
          color: 'rgba(201,169,110,0.45)',
          fontSize: '9px',
          letterSpacing: '0.22em',
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Separator ───────────────────────────────────────────────────────────────

function Separator() {
  return (
    <motion.div
      className="flex flex-col gap-1.5 mb-5"
      animate={{ opacity: [0.6, 0.15, 0.6] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
      aria-hidden="true"
    >
      <div
        className="rounded-full"
        style={{
          width: 4,
          height: 4,
          background: 'rgba(201,169,110,0.5)',
          boxShadow: '0 0 6px rgba(212,175,112,0.4)',
        }}
      />
      <div
        className="rounded-full"
        style={{
          width: 4,
          height: 4,
          background: 'rgba(201,169,110,0.5)',
          boxShadow: '0 0 6px rgba(212,175,112,0.4)',
        }}
      />
    </motion.div>
  );
}

// ─── CountdownTimer ──────────────────────────────────────────────────────────

interface CountdownTimerProps {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
}

export default function CountdownTimer({
  days,
  hours,
  minutes,
  seconds,
  isExpired,
}: CountdownTimerProps) {
  if (isExpired) {
    return (
      <motion.p
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: '1.25rem',
          color: '#D4AF70',
          textShadow: '0 0 30px rgba(212,175,112,0.5)',
          letterSpacing: '0.1em',
        }}
      >
        We're back — refreshing now…
      </motion.p>
    );
  }

  const units = [
    { value: days, label: 'Days' },
    { value: hours, label: 'Hours' },
    { value: minutes, label: 'Mins' },
    { value: seconds, label: 'Secs' },
  ];

  return (
    <div
      className="flex items-center gap-1 sm:gap-2"
      role="timer"
      aria-label={`${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds remaining`}
    >
      {units.map((u, i) => (
        <div key={u.label} className="flex items-center gap-1 sm:gap-2">
          <FlipUnit value={u.value} label={u.label} />
          {i < units.length - 1 && <Separator />}
        </div>
      ))}
    </div>
  );
}
