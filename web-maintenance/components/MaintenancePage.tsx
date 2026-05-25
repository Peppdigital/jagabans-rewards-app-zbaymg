'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import {
  FileText,
  Mail,
  Instagram,
  Facebook,
  Twitter,
  Youtube,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';

import ParticleField from './ParticleField';
import CountdownTimer from './CountdownTimer';
import EmailSubscribe from './EmailSubscribe';
import { useCountdown } from '../hooks/useCountdown';

// ─── Configuration ────────────────────────────────────────────────────────────
// Adjust these to match your actual reopening window
const REOPEN_DATE = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000);
const START_DATE = new Date(Date.now() - 2 * 60 * 60 * 1000);

const SOCIAL = [
  { icon: Instagram, href: 'https://instagram.com/jagabansfoodla', label: 'Instagram' },
  { icon: Facebook, href: 'https://facebook.com/jagabansla', label: 'Facebook' },
  { icon: Twitter, href: 'https://twitter.com/jagabansfoodla', label: 'X / Twitter' },
  { icon: Youtube, href: 'https://youtube.com/@jagabansla', label: 'YouTube' },
];

const CHEF_QUOTES = [
  '"Every great dish begins with patience."',
  '"Excellence requires the courage to pause."',
  '"We are sharpening our craft for you."',
  '"Good things are worth the wait."',
];

// ─── Animation variants ────────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1], delay },
  }),
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.4 } },
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function GoldLine({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ scaleX: 0, opacity: 0 }}
      animate={{ scaleX: 1, opacity: 1 }}
      transition={{ duration: 1.4, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{
        height: 1,
        width: 80,
        background:
          'linear-gradient(90deg, transparent, #C9A96E 40%, #E8C882 60%, #C9A96E 80%, transparent)',
      }}
    />
  );
}

function Divider({ label }: { label?: string }) {
  return (
    <div className="flex items-center w-full gap-3" aria-hidden>
      <div className="flex-1 h-px" style={{ background: 'rgba(201,169,110,0.09)' }} />
      {label && (
        <span
          className="uppercase tracking-widest shrink-0"
          style={{ color: 'rgba(201,169,110,0.3)', fontSize: 9, letterSpacing: '0.22em' }}
        >
          {label}
        </span>
      )}
      <div className="flex-1 h-px" style={{ background: 'rgba(201,169,110,0.09)' }} />
    </div>
  );
}

// Animated background – isolated to avoid re-renders
function Background() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {/* Base */}
      <div className="absolute inset-0" style={{ background: '#0C0C0E' }} />

      {/* Deep red warm center bloom */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 75% 55% at 50% 52%, rgba(122,27,34,0.14) 0%, transparent 68%)',
        }}
      />

      {/* Gold top-right halo */}
      <div
        className="absolute"
        style={{
          top: '-15%', right: '-8%',
          width: 700, height: 700,
          background:
            'radial-gradient(circle, rgba(201,169,110,0.07) 0%, transparent 60%)',
        }}
      />

      {/* Red bottom-left halo */}
      <div
        className="absolute"
        style={{
          bottom: '-20%', left: '-10%',
          width: 600, height: 600,
          background:
            'radial-gradient(circle, rgba(196,30,58,0.08) 0%, transparent 60%)',
        }}
      />

      {/* Breathing gradient overlay */}
      <motion.div
        className="absolute inset-0"
        animate={{
          background: [
            'radial-gradient(ellipse 90% 65% at 50% 50%, rgba(122,27,34,0.07) 0%, transparent 70%)',
            'radial-gradient(ellipse 65% 90% at 50% 50%, rgba(201,169,110,0.04) 0%, transparent 70%)',
            'radial-gradient(ellipse 90% 65% at 50% 50%, rgba(122,27,34,0.07) 0%, transparent 70%)',
          ],
        }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Fine grid */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.03,
          backgroundImage: `
            linear-gradient(rgba(201,169,110,1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(201,169,110,1) 1px, transparent 1px)
          `,
          backgroundSize: '64px 64px',
        }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, rgba(0,0,0,0.7) 100%)',
        }}
      />
    </div>
  );
}

// ─── MaintenancePage ─────────────────────────────────────────────────────────

export default function MaintenancePage() {
  const { days, hours, minutes, seconds, isExpired, progress } =
    useCountdown(REOPEN_DATE, START_DATE);

  const [quoteIndex] = useState(() =>
    Math.floor(Math.random() * CHEF_QUOTES.length)
  );

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      <Background />
      <ParticleField count={38} />

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <motion.main
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="relative z-10 w-full max-w-2xl mx-auto px-4 py-12 flex flex-col items-center gap-7"
      >
        {/* Brand mark ring */}
        <motion.div variants={fadeUp} custom={0} className="flex flex-col items-center gap-3">
          <motion.div
            className="relative flex items-center justify-center rounded-full"
            style={{
              width: 72, height: 72,
              border: '1px solid rgba(201,169,110,0.3)',
              background:
                'radial-gradient(circle, rgba(201,169,110,0.06) 0%, transparent 70%)',
            }}
            animate={{
              boxShadow: [
                '0 0 0 0 rgba(201,169,110,0)',
                '0 0 0 14px rgba(201,169,110,0.07)',
                '0 0 0 28px rgba(201,169,110,0)',
              ],
            }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeOut' }}
          >
            {/* Replace with <Image src="/logo.svg" … /> once you have the asset */}
            <svg
              viewBox="0 0 40 40"
              fill="none"
              style={{ width: 36, height: 36 }}
              aria-label="Jagabans logo mark"
            >
              {/* Minimal crown / chef silhouette */}
              <path
                d="M8 30 Q10 18 20 16 Q30 18 32 30"
                stroke="#C9A96E"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M6 30 H34"
                stroke="#C9A96E"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="20" cy="11" r="3" fill="#C9A96E" opacity="0.8" />
              <circle cx="11" cy="14" r="2" fill="#C9A96E" opacity="0.5" />
              <circle cx="29" cy="14" r="2" fill="#C9A96E" opacity="0.5" />
            </svg>
          </motion.div>
        </motion.div>

        {/* ── Glass card ─────────────────────────────────────────────────── */}
        <motion.div
          variants={fadeUp}
          custom={0.1}
          className="w-full rounded-2xl flex flex-col items-center gap-6 px-5 sm:px-10 py-9"
          style={{
            background:
              'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(201,169,110,0.13)',
            boxShadow:
              '0 2px 0 rgba(255,255,255,0.04) inset, 0 32px 80px rgba(0,0,0,0.5)',
          }}
        >
          <GoldLine delay={0.6} />

          {/* Brand name */}
          <motion.div
            variants={fadeUp}
            custom={0.15}
            className="text-center"
          >
            <motion.h1
              className="font-light uppercase tracking-widest"
              style={{
                fontFamily: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
                fontSize: 'clamp(28px, 7vw, 48px)',
                color: '#C9A96E',
                letterSpacing: '0.38em',
              }}
              animate={{
                textShadow: [
                  '0 0 18px rgba(201,169,110,0.2)',
                  '0 0 48px rgba(201,169,110,0.55)',
                  '0 0 18px rgba(201,169,110,0.2)',
                ],
              }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              Jagabans
            </motion.h1>
            <p
              className="mt-0.5 tracking-widest uppercase font-light"
              style={{
                color: 'rgba(201,169,110,0.45)',
                fontSize: 11,
                letterSpacing: '0.45em',
              }}
            >
              L &middot; A
            </p>
          </motion.div>

          <Divider />

          {/* Headline */}
          <motion.div variants={fadeUp} custom={0.2} className="text-center space-y-1">
            <p
              className="uppercase tracking-widest"
              style={{
                color: 'rgba(201,169,110,0.4)',
                fontSize: 10,
                letterSpacing: '0.3em',
              }}
            >
              — Just a moment —
            </p>
            <h2
              className="font-light leading-tight"
              style={{
                fontFamily: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
                fontSize: 'clamp(22px, 5vw, 34px)',
                color: '#F0EDE8',
              }}
            >
              We're Preparing{' '}
              <span
                style={{
                  fontStyle: 'italic',
                  color: '#C9A96E',
                }}
              >
                Something Exceptional
              </span>
            </h2>
          </motion.div>

          {/* Body */}
          <motion.p
            variants={fadeUp}
            custom={0.25}
            className="text-center leading-relaxed max-w-md"
            style={{
              color: 'rgba(240,237,232,0.5)',
              fontSize: 'clamp(13px, 2.5vw, 15px)',
              lineHeight: 1.85,
            }}
          >
            We're refreshing the Jagabans experience to serve you better. Our team
            is working behind the scenes to elevate your digital experience, update
            our offerings, and prepare something truly special.{' '}
            <em style={{ color: 'rgba(201,169,110,0.65)', fontStyle: 'normal' }}>
              Thank you for your patience.
            </em>
          </motion.p>

          {/* Countdown */}
          <motion.div variants={fadeUp} custom={0.3}>
            <CountdownTimer
              days={days}
              hours={hours}
              minutes={minutes}
              seconds={seconds}
              isExpired={isExpired}
            />
          </motion.div>

          {/* Progress bar */}
          <motion.div variants={fadeUp} custom={0.32} className="w-full">
            <div
              className="w-full overflow-hidden rounded-full"
              style={{ height: 1, background: 'rgba(201,169,110,0.1)' }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ width: `${progress}%` }}
                animate={{
                  background: [
                    'linear-gradient(90deg, transparent 0%, #C9A96E 40%, #E8C882 60%, #C9A96E 100%)',
                    'linear-gradient(90deg, #C9A96E 0%, #E8C882 40%, #C9A96E 60%, transparent 100%)',
                    'linear-gradient(90deg, transparent 0%, #C9A96E 40%, #E8C882 60%, #C9A96E 100%)',
                  ],
                }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
            <div
              className="flex justify-between mt-1.5"
              style={{ color: 'rgba(201,169,110,0.28)', fontSize: 9, letterSpacing: '0.15em' }}
            >
              <span className="uppercase tracking-widest">Maintenance Started</span>
              <span className="uppercase tracking-widest">{Math.round(progress)}% Complete</span>
            </div>
          </motion.div>

          <Divider label="Stay Connected" />

          {/* Email subscribe */}
          <motion.div
            variants={fadeUp}
            custom={0.36}
            className="w-full flex flex-col items-center gap-3"
          >
            <p
              className="text-center uppercase tracking-widest"
              style={{ color: 'rgba(201,169,110,0.4)', fontSize: 10, letterSpacing: '0.22em' }}
            >
              Notify me when you're back
            </p>
            <EmailSubscribe />
          </motion.div>

          <Divider />

          {/* Action buttons */}
          <motion.div
            variants={fadeUp}
            custom={0.4}
            className="flex flex-col sm:flex-row gap-3 w-full sm:justify-center"
          >
            <motion.a
              href="/menu.pdf"
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.025, borderColor: 'rgba(201,169,110,0.45)' }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center justify-center gap-2 rounded-xl text-sm tracking-wider uppercase transition-colors"
              style={{
                padding: '13px 22px',
                background: 'rgba(201,169,110,0.07)',
                border: '1px solid rgba(201,169,110,0.18)',
                color: '#C9A96E',
                letterSpacing: '0.1em',
              }}
            >
              <FileText style={{ width: 15, height: 15 }} aria-hidden />
              View Our Menu
              <ExternalLink style={{ width: 11, height: 11, opacity: 0.5 }} aria-hidden />
            </motion.a>

            <motion.a
              href="mailto:hello@jagabansla.com"
              whileHover={{ scale: 1.025, borderColor: 'rgba(255,255,255,0.14)' }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center justify-center gap-2 rounded-xl text-sm tracking-wider uppercase transition-colors"
              style={{
                padding: '13px 22px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                color: 'rgba(240,237,232,0.5)',
                letterSpacing: '0.1em',
              }}
            >
              <Mail style={{ width: 15, height: 15 }} aria-hidden />
              Contact Support
            </motion.a>
          </motion.div>

          {/* Social links */}
          <motion.nav
            variants={fadeUp}
            custom={0.44}
            className="flex items-center gap-5"
            aria-label="Social media links"
          >
            {SOCIAL.map(({ icon: Icon, href, label }) => (
              <motion.a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                whileHover={{ scale: 1.2, color: '#C9A96E' }}
                whileTap={{ scale: 0.9 }}
                style={{ color: 'rgba(201,169,110,0.3)' }}
                className="transition-colors"
              >
                <Icon style={{ width: 18, height: 18 }} />
              </motion.a>
            ))}
          </motion.nav>

          {/* Chef quote */}
          <motion.blockquote
            variants={fadeUp}
            custom={0.48}
            className="text-center"
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontStyle: 'italic',
              color: 'rgba(201,169,110,0.28)',
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {CHEF_QUOTES[quoteIndex]}
          </motion.blockquote>

          <GoldLine delay={1.0} />
        </motion.div>

        {/* Footer */}
        <motion.footer variants={fadeUp} custom={0.52} className="text-center">
          <p
            className="uppercase tracking-widest"
            style={{ color: 'rgba(201,169,110,0.18)', fontSize: 9, letterSpacing: '0.2em' }}
          >
            &copy; {new Date().getFullYear()} Jagabans L.A. &middot; All Rights Reserved
          </p>
        </motion.footer>
      </motion.main>
    </div>
  );
}
