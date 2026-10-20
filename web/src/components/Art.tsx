import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, type TargetAndTransition } from 'motion/react';
import type { Mood } from '../../../shared/types.ts';

/** A Microsoft Fluent 3D emoji from /fluent (MIT). Decorative unless `label` is given. */
export function Fluent({ name, size = 20, label, style }: { name: string; size?: number; label?: string; style?: React.CSSProperties }) {
  return (
    <img
      src={`/fluent/${name}.png`}
      width={size}
      height={size}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      draggable={false}
      style={{ display: 'inline-block', verticalAlign: '-0.2em', objectFit: 'contain', ...style }}
    />
  );
}

const portraitSrc = (who: string, mood: Mood) => `/avatars/${who}-${mood}.svg`;

// Munim ji only has three faces.
function faceFor(who: string, mood: Mood): Mood {
  if (who !== 'munim') return mood;
  return mood === 'angry' || mood === 'annoyed' || mood === 'suspicious' ? 'angry' : mood === 'happy' || mood === 'impressed' ? 'happy' : 'neutral';
}

/** How the body reacts when the mood changes. */
const MOTION: Record<Mood, TargetAndTransition> = {
  angry: { x: [0, -9, 9, -7, 7, -4, 4, 0], rotate: [0, -4, 4, -3, 3, 0], transition: { duration: 0.65 } },
  annoyed: { rotate: [0, -7, 5, -3, 0], transition: { duration: 0.7 } },
  happy: { y: [0, -14, 0, -7, 0], transition: { duration: 0.75, ease: 'easeOut' } },
  impressed: { scale: [1, 1.18, 0.96, 1.05, 1], transition: { duration: 0.7 } },
  suspicious: { rotate: [0, -9, -9, -9, 0], x: [0, -5, -5, -5, 0], transition: { duration: 1.4, times: [0, 0.15, 0.5, 0.85, 1] } },
  neutral: { rotate: 0, x: 0, y: 0, scale: 1 },
};

/** The pop-up reaction next to the face. */
const REACTION: Record<Mood, string[] | null> = {
  angry: ['anger', 'angry'],
  annoyed: ['annoyed'],
  happy: ['happy'],
  impressed: ['sparkles', 'impressed'],
  suspicious: ['suspicious'],
  neutral: null,
};

/**
 * A shopkeeper's portrait that changes expression with the mood. With `react`, every mood
 * change plays a body animation and pops a 3D reaction (and a red pulse when angry).
 */
export function Portrait({
  who,
  mood,
  size = 64,
  color,
  react = false,
  ring = true,
  beat = 0,
  entrance = false,
}: {
  who: string;
  mood: Mood;
  size?: number;
  color: string;
  react?: boolean;
  ring?: boolean;
  /** bump to replay the reaction even if the mood didn't change (one per reply) */
  beat?: number;
  /** also react once when first shown */
  entrance?: boolean;
}) {
  const face = faceFor(who, mood);
  // `tick` replays the body animation; `popped` shows the reaction for a moment
  const [tick, setTick] = useState(0);
  const [popped, setPopped] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!entrance) return;
    }
    if (!react || (mood === 'neutral' && beat === 0)) return;
    setTick((t) => t + 1);
    setPopped(true);
    const t = setTimeout(() => setPopped(false), 2200);
    return () => clearTimeout(t);
  }, [mood, react, beat]);
  const reaction = popped ? REACTION[mood] : null;

  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <motion.div
        key={tick}
        animate={react && tick > 0 ? MOTION[mood] : undefined}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: `radial-gradient(circle at 50% 35%, #fff 0%, ${color}40 70%)`,
          border: ring ? `${Math.max(2, Math.round(size / 28))}px solid var(--ink)` : 'none',
          overflow: 'hidden',
          boxShadow: popped && mood === 'angry' ? '0 0 0 6px rgba(220,38,38,.35)' : 'var(--shadow-sm)',
          transition: 'box-shadow .4s ease',
        }}
      >
        <img
          src={portraitSrc(who, face)}
          alt=""
          width={size}
          height={size}
          draggable={false}
          // small portraits zoom in on the face so the expression stays readable
          style={{ display: 'block', width: '100%', height: '100%', transform: who === 'bot' ? 'scale(0.92)' : size < 60 ? 'translateY(16%) scale(1.5)' : 'translateY(7%) scale(1.12)' }}
        />
      </motion.div>
      <AnimatePresence>
        {reaction && (
          <motion.div
            key={`r${tick}`}
            initial={{ scale: 0, opacity: 0, y: 6, rotate: -20 }}
            animate={{ scale: [0, 1.25, 1], opacity: 1, y: 0, rotate: 0 }}
            exit={{ scale: 0.6, opacity: 0, y: -10 }}
            transition={{ duration: 0.45 }}
            style={{ position: 'absolute', right: -size * 0.18, top: -size * 0.12, display: 'flex', gap: 2, pointerEvents: 'none' }}
          >
            {reaction.map((r) => (
              <Fluent key={r} name={r} size={Math.round(size * 0.42)} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
