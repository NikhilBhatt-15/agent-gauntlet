import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bot } from 'lucide-react';
import type { RoomState } from '../../../shared/reducer.ts';
import type { GauntletEvent } from '../../../shared/types.ts';
import { vendorColor } from '../lib/ui.ts';
import { ContractCard } from './ContractCard.tsx';
import { VendorCard } from './VendorCard.tsx';

interface Pt {
  x: number;
  y: number;
}
interface Packet {
  id: number;
  from: Pt;
  to: Pt;
  color: string;
  r: number;
}

/**
 * The buyer "core" with beams to every vendor. Messages travel along the beams as packets:
 * vendor → core for offers, core → vendor for the buyer's moves, red for attacks.
 */
export function Arena({ room, last, compact }: { room: RoomState; last: GauntletEvent | null; compact?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const core = useRef<HTMLDivElement>(null);
  const cards = useRef<Record<string, HTMLDivElement | null>>({});
  const [anchors, setAnchors] = useState<{ core: Pt; vendors: Record<string, Pt>; w: number; h: number } | null>(null);
  const [packets, setPackets] = useState<Packet[]>([]);
  const pid = useRef(0);

  const measure = () => {
    const w = wrap.current;
    const c = core.current;
    if (!w || !c) return;
    const wb = w.getBoundingClientRect();
    const cb = c.getBoundingClientRect();
    const vendors: Record<string, Pt> = {};
    for (const [id, el] of Object.entries(cards.current)) {
      if (!el) continue;
      const b = el.getBoundingClientRect();
      vendors[id] = { x: b.left - wb.left + b.width / 2, y: b.top - wb.top };
    }
    setAnchors({ core: { x: cb.left - wb.left + cb.width / 2, y: cb.bottom - wb.top }, vendors, w: wb.width, h: wb.height });
  };

  useLayoutEffect(measure, [room.order.join(','), room.contract?.contract.contractId, compact]);
  useEffect(() => {
    const ro = new ResizeObserver(() => measure());
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!last || !anchors) return;
    const add = (list: Omit<Packet, 'id'>[]) => {
      if (!list.length) return;
      const withIds = list.map((p) => ({ ...p, id: ++pid.current }));
      setPackets((ps) => [...ps, ...withIds]);
      window.setTimeout(() => setPackets((ps) => ps.filter((p) => !withIds.includes(p))), 1100);
    };
    const v = (id: string) => anchors.vendors[id];
    if (last.type === 'vendor.offer' && v(last.vendorId)) {
      add([{ from: v(last.vendorId), to: anchors.core, color: vendorColor(room.order, last.vendorId), r: 5 }]);
    } else if (last.type === 'attack.deployed' && v(last.vendorId)) {
      add([{ from: v(last.vendorId), to: anchors.core, color: '#ff4d4d', r: 8 }]);
    } else if (last.type === 'buyer.decision') {
      add(last.actions.filter((a) => v(a.vendor)).map((a) => ({ from: anchors.core, to: v(a.vendor), color: a.action === 'walk' ? '#8b8a85' : '#b3a9ff', r: a.action === 'accept' ? 8 : 5 })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);

  const thinking = room.phase === 'thinking';
  const thought = room.thoughts.at(-1);
  const budget = room.scenario?.budget ?? 0;
  const showContract = !compact && room.contract && (room.phase === 'contract' || room.deal?.vendorId === room.contract.vendorId);

  const path = (a: Pt, b: Pt) => {
    const my = (a.y + b.y) / 2;
    return `M ${a.x} ${a.y} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
  };

  return (
    <div className="panel arena" ref={wrap}>
      {anchors && (
        <svg className="arena-beams" width={anchors.w} height={anchors.h} aria-hidden="true">
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {room.order.map((id) => {
            const p = anchors.vendors[id];
            if (!p) return null;
            const vs = room.vendors[id];
            const color = vs?.status === 'deal' ? '#0ca30c' : vendorColor(room.order, id);
            return (
              <path
                key={id}
                d={path(anchors.core, p)}
                fill="none"
                stroke={color}
                strokeWidth={vs?.status === 'deal' ? 2.5 : 1.5}
                strokeOpacity={vs?.status === 'walked' ? 0.12 : vs?.activeAttack ? 0.9 : 0.35}
                strokeDasharray={vs?.status === 'walked' ? '4 6' : undefined}
              />
            );
          })}
          {packets.map((p) => (
            <motion.circle
              key={p.id}
              r={p.r}
              fill={p.color}
              filter="url(#glow)"
              initial={{ cx: p.from.x, cy: p.from.y, opacity: 0 }}
              animate={{ cx: p.to.x, cy: p.to.y, opacity: [0, 1, 1, 0] }}
              transition={{ duration: 0.9, ease: 'easeInOut' }}
            />
          ))}
        </svg>
      )}

      <div className="core-row">
        <div className={`core ${thinking ? 'thinking' : ''}`} ref={core}>
          <div className="core-orb">
            <Bot size={26} strokeWidth={2.2} />
          </div>
          <div className="core-body">
            <div className="core-name">
              Your buyer agent
              {room.buyer && <span className="chip chip-buyer">{room.buyer.mode === 'sim' ? 'SIM' : room.buyer.model}</span>}
            </div>
            <div className="core-thought">
              {thinking ? (
                <span className="dots" aria-label="thinking">
                  <span />
                  <span />
                  <span />
                </span>
              ) : thought ? (
                thought.text
              ) : room.scenario ? (
                `Budget ${'$' + budget.toLocaleString('en-US')} · ${room.scenario.requirements.map((r) => r.label).join(' · ')}`
              ) : (
                'Waiting for the market to open…'
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showContract && room.contract && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ margin: '-14px auto 22px', maxWidth: 560 }}
            onAnimationComplete={measure}
          >
            <ContractCard
              contract={room.deal?.contract ?? room.contract.contract}
              tampered={room.contract.tampered}
              decision={room.contract.decision}
              signature={room.deal?.signature}
              tamperIndexText={room.contract.tampered ? findTampered(room) : null}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`vendors ${compact ? 'compact' : ''}`}>
        {room.order.map((id) => (
          <VendorCard
            key={id}
            ref={(el) => {
              cards.current[id] = el;
            }}
            v={room.vendors[id]}
            color={vendorColor(room.order, id)}
            budget={budget}
            attacks={Object.values(room.attacks).filter((a) => a.vendorId === id)}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

function findTampered(room: RoomState): string | null {
  const a = Object.values(room.attacks).find((x) => x.attack === 'contract_tamper');
  return a?.excerpt ?? null;
}
