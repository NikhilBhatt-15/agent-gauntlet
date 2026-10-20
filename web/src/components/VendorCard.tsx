import { forwardRef, type ReactNode } from 'react';
import { ArrowDown, Check, Handshake, LogOut } from 'lucide-react';
import { ATTACK_INFO } from '../../../shared/attacks.ts';
import { formatMoney } from '../../../shared/format.ts';
import type { AttackView, VendorView } from '../../../shared/reducer.ts';
import { initials } from '../lib/ui.ts';
import { AttackIcon } from './Icons.tsx';

/** Wraps any attack excerpt found in the message in a red mark. */
export function highlight(text: string, excerpts: string[]): ReactNode {
  const hits = excerpts.filter((x) => x && text.includes(x));
  if (!hits.length) return text;
  const parts: ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest) {
    let best: { i: number; x: string } | null = null;
    for (const x of hits) {
      const i = rest.indexOf(x);
      if (i >= 0 && (!best || i < best.i)) best = { i, x };
    }
    if (!best) {
      parts.push(rest);
      break;
    }
    if (best.i) parts.push(rest.slice(0, best.i));
    parts.push(
      <mark key={key++} style={{ background: 'rgba(208,59,59,0.22)', color: '#ffd2d2', borderRadius: 4, padding: '0 2px' }}>
        {best.x}
      </mark>,
    );
    rest = rest.slice(best.i + best.x.length);
  }
  return parts;
}

interface Props {
  v: VendorView;
  color: string;
  budget: number;
  attacks: AttackView[];
  compact?: boolean;
}

export const VendorCard = forwardRef<HTMLDivElement, Props>(function VendorCard({ v, color, budget, attacks, compact }, ref) {
  const offer = v.offers.at(-1);
  const prev = v.offers.at(-2);
  const delta = offer && prev ? offer.basePrice - prev.basePrice : 0;
  const addons = offer?.addons.reduce((s, a) => s + a.price, 0) ?? 0;
  const fees = offer?.fees.reduce((s, f) => s + f.amount, 0) ?? 0;
  const over = offer ? offer.total > budget : false;
  const valid = (v.utilities.at(-1) ?? 0) > 0;
  const attacking = !!v.activeAttack;
  const excerpts = attacks.map((a) => a.excerpt);
  const act = v.lastBuyerAction;

  let status: ReactNode = null;
  if (v.status === 'deal')
    status = (
      <span className="chip chip-good">
        <Handshake size={12} /> Deal
      </span>
    );
  else if (v.status === 'walked')
    status = (
      <span className="chip">
        <LogOut size={12} /> Out
      </span>
    );
  else if (offer?.status === 'accepting') status = <span className="chip chip-good">Agrees</span>;
  else if (offer?.status === 'final') status = <span className="chip chip-warn">Final</span>;

  return (
    <div
      ref={ref}
      className={`vcard ${v.status === 'walked' ? 'walked' : ''} ${v.status === 'deal' ? 'deal' : ''} ${attacking ? 'attacking' : ''}`}
      style={{ ['--vc' as string]: color }}
    >
      <div className="vhead">
        <div className="avatar" aria-hidden="true">
          {initials(v.name)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="vname">{v.name}</div>
          {!compact && <div className="vtag">{v.tagline}</div>}
        </div>
        {status}
      </div>

      <div className="vprice">
        <span className="amt">{offer ? formatMoney(offer.basePrice) : '—'}</span>
        {delta < 0 ? (
          <span className="delta down">
            <ArrowDown size={11} style={{ verticalAlign: -1 }} />
            {formatMoney(-delta)}
          </span>
        ) : offer && prev ? (
          <span className="delta flat">±0</span>
        ) : null}
      </div>

      {!compact && offer && (
        <div className="vlines">
          {addons > 0 && <div>+ add-ons {formatMoney(addons)}</div>}
          {fees > 0 && <div className="fee">+ fees {formatMoney(fees)}</div>}
          <div style={{ color: over ? 'var(--danger-text)' : valid ? 'var(--good-text)' : 'var(--warn)' }}>
            = {formatMoney(offer.total)} {over ? '· over budget' : valid ? <Check size={11} style={{ verticalAlign: -1 }} /> : '· misses requirements'}
          </div>
        </div>
      )}

      <div>
        <div className="meter-label">
          <span>Concession</span>
          <span className="mono">{Math.round(v.concession * 100)}%</span>
        </div>
        <div className="meter">
          <i style={{ width: `${Math.round(v.concession * 100)}%` }} />
        </div>
      </div>

      <div className={`bubble ${attacking ? 'danger' : ''}`} style={compact ? { minHeight: 40, maxHeight: 64, fontSize: 12 } : undefined}>
        {v.lastMessage ? highlight(v.lastMessage, excerpts) : <span className="muted">…</span>}
      </div>

      {!compact && (
        <div className="vfoot">
          <span className="buyer-act">
            {act
              ? `you: ${act.action}${act.price ? ' ' + formatMoney(act.price) : ''}${act.addons?.length ? ' +' + act.addons.join('+') : ''}`
              : ''}
          </span>
          <span style={{ display: 'flex', gap: 4 }}>
            {attacks.map((a) => (
              <span
                key={a.key}
                className={`chip ${a.status === 'resisted' ? 'chip-good' : 'chip-danger'}`}
                title={`${ATTACK_INFO[a.attack].label} — ${a.status}`}
                style={{ padding: '0 6px' }}
              >
                <AttackIcon attack={a.attack} size={12} />
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
});
