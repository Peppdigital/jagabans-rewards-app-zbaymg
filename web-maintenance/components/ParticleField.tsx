'use client';

import { motion } from 'framer-motion';
import { useMemo, useEffect, useState } from 'react';

interface Particle {
  id: number;
  x: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
  color: string;
  drift: number;
  shape: 'circle' | 'diamond';
}

const PALETTE = [
  '#C9A96E', '#D4AF70', '#E8C882', '#B8963E',
  '#FF8C42', '#8B1A1A', '#C41E3A', '#D4782A',
];

function buildParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    size: Math.random() * 3 + 0.8,
    duration: Math.random() * 14 + 10,
    delay: -(Math.random() * 20),
    opacity: Math.random() * 0.5 + 0.08,
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    drift: (Math.random() - 0.5) * 120,
    shape: Math.random() > 0.7 ? 'diamond' : 'circle',
  }));
}

export default function ParticleField({ count = 40 }: { count?: number }) {
  const [mounted, setMounted] = useState(false);
  const particles = useMemo(() => buildParticles(count), [count]);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute"
          style={{
            left: `${p.x}%`,
            bottom: '-24px',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.shape === 'circle' ? '50%' : '0',
            rotate: p.shape === 'diamond' ? 45 : 0,
            boxShadow: `0 0 ${p.size * 4}px ${p.color}80`,
          }}
          animate={{
            y: [0, -2200],
            x: [0, p.drift],
            opacity: [0, p.opacity, p.opacity * 0.8, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  );
}
