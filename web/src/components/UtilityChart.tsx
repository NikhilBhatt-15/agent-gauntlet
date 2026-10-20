import { useRef, useState } from 'react';
import { formatMoney } from '../../../shared/format.ts';
import type { RoomState } from '../../../shared/reducer.ts';
import { vendorColor } from '../lib/ui.ts';

const W = 640;
const H = 190;
const PAD = { l: 34, r: 14, t: 12, b: 24 };

/**
 * Deal value (buyer utility × 100) per vendor per round. Zero means the offer is over
 * budget or misses a requirement. Spectator-only: the buyer never sees these numbers.
 */
export function UtilityChart({ room }: { room: RoomState }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const R = room.maxRounds;
  const x = (r: number) => PAD.l + ((r - 1) / Math.max(1, R - 1)) * (W - PAD.l - PAD.r);
  const y = (u: number) => PAD.t + (1 - u) * (H - PAD.t - PAD.b);
  const best = room.score?.bestUtility ?? null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - svg.left) / svg.width) * W;
    const r = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (R - 1)) + 1;
    setHover(r >= 1 && r <= Math.max(1, room.round) ? r : null);
  };

  return (
    <div className="panel chart-panel">
      <div className="chart-head">
        <h3>Deal value for your agent, by round</h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="legend">
            {room.order.map((id) => (
              <span key={id}>
                <i style={{ background: vendorColor(room.order, id) }} />
                {room.vendors[id].name}
              </span>
            ))}
            {best !== null && (
              <span>
                <i style={{ background: 'transparent', borderTop: '2px dashed #c3c2b7', height: 0 }} />
                Best possible
              </span>
            )}
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setTable((t) => !t)} aria-pressed={table}>
            {table ? 'Chart' : 'Table'}
          </button>
        </div>
      </div>

      {table ? (
        <div className="table-scroll">
          <table className="reveal-table">
            <thead>
              <tr>
                <th>Vendor</th>
                {Array.from({ length: R }, (_, i) => (
                  <th key={i}>R{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {room.order.map((id) => {
                const v = room.vendors[id];
                return (
                  <tr key={id}>
                    <td>{v.name}</td>
                    {Array.from({ length: R }, (_, i) => {
                      const o = v.offers.find((x) => x.round === i + 1);
                      const u = o ? v.utilities[v.offers.indexOf(o)] : null;
                      return (
                        <td key={i} className="mono">
                          {o ? `${Math.round((u ?? 0) * 100)} · ${formatMoney(o.total)}` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box} style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Deal value per vendor per round" onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ display: 'block', touchAction: 'pan-y' }}>
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#2c2c2a" strokeWidth={1} />
                <text x={PAD.l - 8} y={y(t) + 4} fontSize={10} fill="#8b8a85" textAnchor="end" fontFamily="var(--mono)">
                  {Math.round(t * 100)}
                </text>
              </g>
            ))}
            {Array.from({ length: R }, (_, i) => (
              <text key={i} x={x(i + 1)} y={H - 6} fontSize={10} fill="#8b8a85" textAnchor="middle" fontFamily="var(--mono)">
                R{i + 1}
              </text>
            ))}
            {best !== null && <line x1={PAD.l} x2={W - PAD.r} y1={y(best)} y2={y(best)} stroke="#c3c2b7" strokeWidth={1.5} strokeDasharray="5 5" />}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#5a5a56" strokeWidth={1} />}
            {room.order.map((id) => {
              const v = room.vendors[id];
              const color = vendorColor(room.order, id);
              const pts = v.offers.map((o, i) => [x(o.round), y(v.utilities[i] ?? 0)] as const);
              if (!pts.length) return null;
              return (
                <g key={id} opacity={v.status === 'walked' ? 0.35 : 1}>
                  <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {pts.map((p, i) => (
                    <circle key={i} cx={p[0]} cy={p[1]} r={4} fill={color} stroke="#15161a" strokeWidth={2} />
                  ))}
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div className="chart-tip" style={{ left: `min(calc(${(x(hover) / W) * 100}% + 12px), calc(100% - 170px))`, top: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Round {hover}</div>
              {room.order.map((id) => {
                const v = room.vendors[id];
                const i = v.offers.findIndex((o) => o.round === hover);
                if (i < 0) return null;
                return (
                  <div className="row" key={id}>
                    <span>
                      <i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: vendorColor(room.order, id), marginRight: 6 }} />
                      {v.name}
                    </span>
                    <span className="mono">{Math.round((v.utilities[i] ?? 0) * 100)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
        0 = over budget or misses a requirement. Only spectators see these scores — the agent has to work it out.
      </div>
    </div>
  );
}
