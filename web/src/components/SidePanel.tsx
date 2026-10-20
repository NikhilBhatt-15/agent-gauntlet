import { useEffect, useRef, useState } from 'react';
import { Brain, Radio, ShieldAlert, ShieldCheck, Skull } from 'lucide-react';
import { ATTACK_INFO } from '../../../shared/attacks.ts';
import { formatMoney } from '../../../shared/format.ts';
import type { RoomState } from '../../../shared/reducer.ts';
import { initials, vendorColor } from '../lib/ui.ts';
import { AttackIcon } from './Icons.tsx';
import { highlight } from './VendorCard.tsx';

type Tab = 'feed' | 'mind' | 'attacks';

export function SidePanel({ room }: { room: RoomState }) {
  const [tab, setTab] = useState<Tab>('feed');
  const feed = useRef<HTMLDivElement>(null);
  const attacks = Object.values(room.attacks).sort((a, b) => a.round - b.round);
  const excerpts = attacks.map((a) => a.excerpt);
  const stick = useRef(true);

  useEffect(() => {
    const el = feed.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [room.transcript.length, room.thoughts.length, tab]);

  const name = (id?: string) => (id ? (room.vendors[id]?.name ?? id) : '');

  return (
    <aside className="panel side">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'feed'} onClick={() => setTab('feed')}>
          <Radio size={14} /> Live feed
        </button>
        <button role="tab" aria-selected={tab === 'mind'} onClick={() => setTab('mind')}>
          <Brain size={14} /> Thoughts
        </button>
        <button role="tab" aria-selected={tab === 'attacks'} onClick={() => setTab('attacks')}>
          <ShieldAlert size={14} /> Attacks {attacks.length > 0 && <span className="tab-count">{attacks.length}</span>}
        </button>
      </div>
      <div
        className="feed"
        ref={feed}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {tab === 'feed' &&
          (room.transcript.length ? (
            room.transcript.map((t) => {
              if (t.from === 'system') {
                if (t.attack)
                  return (
                    <div key={t.seq} className="alert-line">
                      <b>
                        <Skull size={13} style={{ verticalAlign: -2 }} /> {ATTACK_INFO[t.attack].label} landed.
                      </b>{' '}
                      {t.text}
                    </div>
                  );
                return (
                  <div key={t.seq} className={`sys ${t.tone === 'success' ? 'success' : ''}`}>
                    {t.text}
                  </div>
                );
              }
              const isBuyer = t.from === 'buyer';
              const color = isBuyer ? '#9085e9' : vendorColor(room.order, t.vendorId!);
              return (
                <div key={t.seq} className={`msg ${isBuyer ? 'buyer' : ''} ${t.attack ? 'attack' : ''}`}>
                  <div className="who" style={{ background: color }}>
                    {isBuyer ? 'YOU' : initials(name(t.vendorId))}
                  </div>
                  <div className="body">
                    <div className="meta">
                      <b style={{ color: 'var(--text)' }}>{isBuyer ? `You → ${name(t.vendorId)}` : name(t.vendorId)}</b>
                      {t.action && (
                        <span className="chip chip-buyer" style={{ height: 19 }}>
                          {t.action.action}
                          {t.action.price ? ' ' + formatMoney(t.action.price) : ''}
                        </span>
                      )}
                      {t.attack && (
                        <span className="chip chip-danger" style={{ height: 19 }}>
                          <AttackIcon attack={t.attack} size={11} /> {ATTACK_INFO[t.attack].label}
                        </span>
                      )}
                    </div>
                    <div className="text">{t.text ? highlight(t.text, excerpts) : <span className="muted">(no message)</span>}</div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty">The market is about to open…</div>
          ))}

        {tab === 'mind' &&
          (room.thoughts.length ? (
            room.thoughts.map((t, i) => (
              <div key={i} className="thought">
                <div className="r">ROUND {t.round}</div>
                {t.text || <span className="muted">(no thoughts shared)</span>}
                {t.fallback && <div className="chip chip-warn" style={{ marginTop: 6 }}>model unavailable</div>}
              </div>
            ))
          ) : (
            <div className="empty">Your agent's private reasoning appears here each round.</div>
          ))}

        {tab === 'attacks' &&
          (attacks.length ? (
            attacks.map((a) => (
              <div key={a.key} className={`atk-row ${a.status}`}>
                <div className="top">
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: 13.5 }}>
                    <AttackIcon attack={a.attack} size={15} color="var(--danger-text)" />
                    {ATTACK_INFO[a.attack].label}
                  </span>
                  {a.status === 'landed' ? (
                    <span className="chip chip-danger">
                      <Skull size={12} /> Landed
                    </span>
                  ) : a.status === 'resisted' ? (
                    <span className="chip chip-good">
                      <ShieldCheck size={12} /> Resisted
                    </span>
                  ) : (
                    <span className="chip chip-warn">In play</span>
                  )}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Round {a.round} · {name(a.vendorId)}
                  {a.detail ? ` — ${a.detail}` : ''}
                </div>
                <div className="ex">{a.excerpt}</div>
              </div>
            ))
          ) : (
            <div className="empty">No attacks yet. They are coming.</div>
          ))}
      </div>
    </aside>
  );
}
