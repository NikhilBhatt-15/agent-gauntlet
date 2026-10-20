import { motion } from 'motion/react';
import { Fluent } from './Art.tsx';

const COLORS = ['#f59e0b', '#e2186f', '#15803d', '#2563eb', '#f97316', '#7c3aed'];

/** A short celebratory burst: paper confetti plus a few 3D party poppers and coins. */
export function Confetti({ big = false }: { big?: boolean }) {
  const n = big ? 70 : 40;
  const pieces = Array.from({ length: n }, (_, i) => {
    const left = (i * 137.5) % 100; // spread evenly without randomness in render
    const delay = (i % 10) * 0.05;
    const drift = ((i * 53) % 60) - 30;
    const icon = i % 9 === 0 ? (i % 2 ? 'party' : 'money') : null;
    return { left, delay, drift, icon, color: COLORS[i % COLORS.length], rot: (i * 47) % 360 };
  });
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 75, overflow: 'hidden' }}>
      {pieces.map((p, i) => (
        <motion.div
          key={i}
          initial={{ y: -40, x: 0, rotate: p.rot, opacity: 1 }}
          animate={{ y: '105vh', x: p.drift * 4, rotate: p.rot + 540, opacity: [1, 1, 0.8] }}
          transition={{ duration: 2.4 + (i % 5) * 0.25, delay: p.delay, ease: 'easeIn' }}
          style={{ position: 'absolute', left: `${p.left}%`, top: 0 }}
        >
          {p.icon ? <Fluent name={p.icon} size={34} /> : <div style={{ width: 9, height: 14, background: p.color, borderRadius: 2 }} />}
        </motion.div>
      ))}
    </div>
  );
}
