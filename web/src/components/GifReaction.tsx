import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '../lib/api.ts';

type Gif = { url: string; width: number; height: number; title: string };

/** "Powered by GIPHY" — required wherever GIPHY content is shown. */
export function GiphyCredit() {
  return (
    <a href="https://giphy.com" target="_blank" rel="noreferrer" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textDecoration: 'none', letterSpacing: '.04em' }}>
      POWERED BY GIPHY
    </a>
  );
}

/** Fetches one GIF for `kind` whenever `trigger` changes and shows it for a few seconds. */
export function GifReaction({ kind, trigger, enabled, stay = 3800 }: { kind: string | null; trigger: number; enabled: boolean; stay?: number }) {
  const [gif, setGif] = useState<Gif | null>(null);
  useEffect(() => {
    if (!enabled || !kind || trigger <= 0) return;
    let alive = true;
    let hide: ReturnType<typeof setTimeout> | undefined;
    api
      .gif(kind)
      .then((g) => {
        if (!alive || !g) return;
        setGif(g);
        hide = setTimeout(() => alive && setGif(null), stay);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (hide) clearTimeout(hide);
    };
  }, [kind, trigger, enabled, stay]);

  return (
    <AnimatePresence>
      {gif && (
        <motion.div
          key={gif.url}
          className="gif-pop"
          initial={{ scale: 0.6, opacity: 0, rotate: -6 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.7, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 20 }}
          onClick={() => setGif(null)}
        >
          <img src={gif.url} alt={gif.title || 'reaction GIF'} style={{ aspectRatio: `${gif.width} / ${gif.height}` }} />
          <GiphyCredit />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A single GIF that loads once (result screen). */
export function GifOnce({ kind, enabled }: { kind: string; enabled: boolean }) {
  const [gif, setGif] = useState<Gif | null>(null);
  useEffect(() => {
    if (enabled) api.gif(kind).then(setGif).catch(() => {});
  }, [kind, enabled]);
  if (!gif) return null;
  return (
    <div style={{ textAlign: 'center', marginTop: 10 }}>
      <img src={gif.url} alt={gif.title || 'reaction GIF'} style={{ maxWidth: '100%', height: 150, borderRadius: 12, border: '2px solid var(--ink)' }} />
      <div>
        <GiphyCredit />
      </div>
    </div>
  );
}
