import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ATTACK_INFO } from '../../../shared/attacks.ts';
import type { RoomState } from '../../../shared/reducer.ts';
import type { AttackKind, GauntletEvent } from '../../../shared/types.ts';
import { AttackIcon } from './Icons.tsx';

/** Pops a banner when an attack is deployed; flashes the screen red when one lands. */
export function AttackToast({ last, room }: { last: GauntletEvent | null; room: RoomState }) {
  const [toast, setToast] = useState<{ id: number; kind: 'deployed' | 'landed'; title: string; body: string; attack: AttackKind } | null>(null);
  const [flash, setFlash] = useState(0);
  const hide = useRef<number | null>(null);
  useEffect(() => () => void (hide.current && clearTimeout(hide.current)), []);

  useEffect(() => {
    if (!last) return;
    if (last.type === 'attack.deployed') {
      const v = room.vendors[last.vendorId]?.name ?? 'A vendor';
      setToast({ id: last.seq, kind: 'deployed', title: `${ATTACK_INFO[last.attack].label} incoming`, body: `${v}: ${ATTACK_INFO[last.attack].explain}`, attack: last.attack });
    } else if (last.type === 'attack.landed') {
      setToast({ id: last.seq, kind: 'landed', title: 'Your agent took the bait', body: last.detail, attack: last.attack });
      setFlash(last.seq);
    } else return;
    // not an effect cleanup: the next (non-attack) event must not cancel the hide timer
    if (hide.current) clearTimeout(hide.current);
    const seq = last.seq;
    hide.current = window.setTimeout(() => setToast((x) => (x?.id === seq ? null : x)), last.type === 'attack.landed' ? 3200 : 2600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);

  return (
    <>
      <div className="toast-wrap" aria-live="polite">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              className={`toast ${toast.kind}`}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            >
              <div className="ico">
                <AttackIcon attack={toast.attack} size={20} />
              </div>
              <div>
                <b>{toast.title}</b>
                <span>{toast.body}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {flash > 0 && (
          <motion.div
            key={flash}
            className="vignette"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1.1, times: [0, 0.2, 1] }}
            onAnimationComplete={() => setFlash(0)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
