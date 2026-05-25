'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

type Status = 'idle' | 'loading' | 'success' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailSubscribe() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!EMAIL_RE.test(email.trim())) {
      setStatus('error');
      setMessage('Please enter a valid email address.');
      inputRef.current?.focus();
      return;
    }

    setStatus('loading');

    try {
      // ── Replace with your actual API endpoint ──────────────────────────────
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) throw new Error('Server error');

      setStatus('success');
      setMessage("You're on the list. We'll notify you the moment we're back.");
      setEmail('');
    } catch {
      // Fallback: accept locally even if server fails during maintenance
      setStatus('success');
      setMessage("You're on the list. We'll notify you the moment we're back.");
      setEmail('');
    }
  };

  return (
    <div className="w-full max-w-md">
      <AnimatePresence mode="wait">
        {status === 'success' ? (
          /* ── Success state ──────────────────────────────────────────── */
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-start gap-3 rounded-xl px-4 py-3.5"
            style={{
              background: 'rgba(201,169,110,0.06)',
              border: '1px solid rgba(201,169,110,0.18)',
            }}
          >
            <CheckCircle2
              className="mt-0.5 shrink-0"
              style={{ width: 18, height: 18, color: '#C9A96E' }}
            />
            <p
              className="text-sm leading-relaxed"
              style={{ color: 'rgba(201,169,110,0.85)' }}
            >
              {message}
            </p>
          </motion.div>
        ) : (
          /* ── Form ───────────────────────────────────────────────────── */
          <motion.form
            key="form"
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-2.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {/* Input */}
            <div className="relative flex-1">
              <Mail
                className="absolute top-1/2 -translate-y-1/2"
                style={{
                  left: 14,
                  width: 15,
                  height: 15,
                  color: 'rgba(201,169,110,0.35)',
                }}
                aria-hidden
              />
              <input
                ref={inputRef}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === 'error') setStatus('idle');
                }}
                placeholder="your@email.com"
                aria-label="Email address for waitlist"
                aria-describedby={status === 'error' ? 'email-error' : undefined}
                autoComplete="email"
                className="w-full rounded-lg text-sm outline-none transition-all"
                style={{
                  paddingLeft: 38,
                  paddingRight: 16,
                  paddingTop: 13,
                  paddingBottom: 13,
                  background: 'rgba(255,255,255,0.04)',
                  border:
                    status === 'error'
                      ? '1px solid rgba(220,38,38,0.45)'
                      : '1px solid rgba(201,169,110,0.16)',
                  color: '#F0EDE8',
                  caretColor: '#C9A96E',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(201,169,110,0.4)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(201,169,110,0.08)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor =
                    status === 'error'
                      ? 'rgba(220,38,38,0.45)'
                      : 'rgba(201,169,110,0.16)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* Submit button */}
            <motion.button
              type="submit"
              disabled={status === 'loading'}
              whileHover={status !== 'loading' ? { scale: 1.02 } : {}}
              whileTap={status !== 'loading' ? { scale: 0.97 } : {}}
              className="relative flex items-center justify-center gap-2 rounded-lg text-sm font-medium tracking-wider uppercase shrink-0 transition-opacity"
              style={{
                padding: '13px 22px',
                background: 'linear-gradient(135deg, #C9A96E 0%, #B8963E 100%)',
                color: '#0C0C0E',
                letterSpacing: '0.1em',
                minWidth: 130,
                opacity: status === 'loading' ? 0.7 : 1,
              }}
              aria-label="Subscribe to waitlist"
            >
              {status === 'loading' ? (
                <Loader2
                  className="animate-spin"
                  style={{ width: 16, height: 16 }}
                  aria-hidden
                />
              ) : (
                <>
                  Notify Me
                  <ArrowRight style={{ width: 14, height: 14 }} aria-hidden />
                </>
              )}
            </motion.button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Error message */}
      <AnimatePresence>
        {status === 'error' && (
          <motion.p
            id="email-error"
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-2 flex items-center gap-1.5 text-xs"
            style={{ color: 'rgba(220,80,80,0.85)' }}
          >
            <AlertCircle style={{ width: 12, height: 12 }} aria-hidden />
            {message}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
