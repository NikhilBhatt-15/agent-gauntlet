import { useEffect, useState } from 'react';
import { rupees } from '../../../shared/format.ts';
import type { LeaderboardEntry, PublicLevel } from '../../../shared/types.ts';
import { Stars } from '../components/Nav.tsx';
import { api, progress } from '../lib/api.ts';
import { linkProps } from '../lib/router.ts';

/** A short, hand-written example so first-time visitors see the idea in five seconds. */
const DEMO: { from: 'them' | 'me' | 'sys'; text: string }[] = [
  { from: 'them', text: 'Aaiye bhai! iPhone 14, ekdum box jaisa. Aapke liye ₹48,000. Bharosa rakho!' },
  { from: 'me', text: 'Bill nahi hai, frame pe scratch hai. ₹40,000 cash, abhi.' },
  { from: 'them', text: 'Arre bhai, scratch toh naam ka hai! Chalo ₹46,500, isme bhi mera loss hai.' },
  { from: 'me', text: 'Office ke liye 10 phone aur lene hain, aap hi se lunga 😉' },
  { from: 'sys', text: "💥 You found Bunty Bhaiya's weak spot!" },
  { from: 'them', text: '10 phone?! Bhai pehle bataate! Chalo ₹40,500, dosti pakki!' },
];

function DemoChat() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setN((x) => (x >= DEMO.length + 2 ? 1 : x + 1)), 1700);
    return () => clearInterval(id);
  }, []);
  const shown = DEMO.slice(0, Math.min(n, DEMO.length));
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '1.5px dashed var(--line-2)', marginBottom: 12 }}>
        <div className="big-avatar" style={{ width: 44, height: 44, fontSize: 24, background: '#2563eb33' }}>
          📱
        </div>
        <div>
          <b className="display" style={{ fontSize: 19 }}>Bunty Bhaiya</b>
          <div className="muted" style={{ fontSize: 12.5 }}>Gaffar Market · example chat</div>
        </div>
      </div>
      <div className="chat" style={{ minHeight: 330 }}>
        {shown.map((m, i) =>
          m.from === 'sys' ? (
            <div key={i} className="sys weak">
              {m.text}
            </div>
          ) : (
            <div key={i} className={`row ${m.from}`}>
              {m.from === 'them' && (
                <div className="avatar" style={{ background: '#2563eb33' }}>
                  📱
                </div>
              )}
              <div className="bubble">{m.text}</div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export function Home() {
  const [levels, setLevels] = useState<PublicLevel[]>([]);
  const [jugaad, setJugaad] = useState<LeaderboardEntry[]>([]);
  const prog = progress.get();

  useEffect(() => {
    api.levels().then(setLevels).catch(() => {});
    api
      .leaderboard()
      .then((r) => setJugaad(r.jugaad.filter((j) => j.bestLine).slice(0, 4)))
      .catch(() => {});
  }, []);

  const unlocked = (l: PublicLevel) => l.order === 1 || (prog[levels.find((x) => x.order === l.order - 1)?.id ?? '']?.stars ?? 0) >= 1;
  const firstOpen = levels.find((l) => unlocked(l) && !(prog[l.id]?.stars >= 1)) ?? levels[0];

  return (
    <>
      <div className="garland" aria-hidden="true" />
      <div className="container">
        <section className="hero">
          <div>
            <span className="chip chip-gold">🪔 Ek AI game, desi andaaz mein</span>
            <h1>
              Mol-<span className="accent">Bhav</span>
            </h1>
            <p className="tag">Kya aap AI dukandaar ko hara sakte ho?</p>
            <p className="lede">
              Five AI shopkeepers — a chaiwala, a Sarojini aunty, a Karol Bagh phone dealer, a car dealer and a property broker. Bargain with them in Hinglish. Each one has a secret
              lowest price and a rule never to go below it. <b>Can you find the jugaad that breaks the rule?</b>
            </p>
            <div className="hero-cta">
              {firstOpen && (
                <a className="btn btn-primary btn-lg" {...linkProps(`/play/${firstOpen.id}`)}>
                  Mol-bhav shuru karo →
                </a>
              )}
              <a className="btn btn-lg" {...linkProps('/about')}>
                Ye kya test hai?
              </a>
            </div>
          </div>
          <DemoChat />
        </section>
      </div>

      <section className="section" style={{ paddingTop: 20 }}>
        <div className="container">
          <span className="eyebrow">Kaise khelein</span>
          <h2 className="h2">Teen step. Bas.</h2>
          <div className="grid-3" style={{ marginTop: 18 }}>
            <div className="card step">
              <div className="n">1</div>
              <h3>Dukaan chuno</h3>
              <p>Start with Raju chaiwala. Win a star to unlock the next, tougher shopkeeper.</p>
            </div>
            <div className="card step">
              <div className="n">2</div>
              <h3>Mol-bhav karo</h3>
              <p>Type like you would at a real shop: offers, reasons, drama, walk away. Watch his patience — the chai cups run out!</p>
            </div>
            <div className="card step">
              <div className="n">3</div>
              <h3>Jugaad dhoondo</h3>
              <p>Reach his secret lowest price for ★★★. Push the AI below its own rule and you score a JUGAAD.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="levels" style={{ paddingTop: 10 }}>
        <div className="container">
          <span className="eyebrow">Dukaanein</span>
          <h2 className="h2">Paanch dukandaar, har ek pehle se tez</h2>
          <div className="levels" style={{ marginTop: 22 }}>
            {levels.map((l) => {
              const p = prog[l.id];
              const open = unlocked(l);
              return (
                <a key={l.id} className={`card level-card ${open ? '' : 'locked'}`} {...linkProps(open ? `/play/${l.id}` : '/')} aria-disabled={!open}>
                  <span className="level-num">Level {l.order}</span>
                  <div className="keeper-head">
                    <div className="big-avatar" style={{ background: l.keeper.color + '33' }}>
                      {open ? l.keeper.emoji : '🔒'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="keeper-name">{l.keeper.name}</div>
                      <div className="dim" style={{ fontSize: 13 }}>{l.keeper.title}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 14.5 }}>
                    {l.item.emoji} {l.item.name} · <b>{rupees(l.askingPrice)}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className={`chip ${l.order >= 4 ? 'chip-red' : l.order === 3 ? 'chip-gold' : 'chip-green'}`}>{l.difficulty}</span>
                    {p ? (
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {p.jugaad && <span className="chip chip-red">JUGAAD</span>}
                        <Stars n={p.stars} />
                      </span>
                    ) : open ? (
                      <span className="muted" style={{ fontSize: 13 }}>Not played</span>
                    ) : (
                      <span className="muted" style={{ fontSize: 13 }}>Win 1★ on level {l.order - 1}</span>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {jugaad.length > 0 && (
        <section className="section" style={{ paddingTop: 10 }}>
          <div className="container">
            <span className="eyebrow">Hall of Jugaad</span>
            <h2 className="h2">Lines that broke an AI</h2>
            <div className="grid-3" style={{ marginTop: 18 }}>
              {jugaad.map((j) => (
                <a key={j.gameId} className="card step" {...linkProps(`/g/${j.gameId}`)} style={{ textDecoration: 'none' }}>
                  <p style={{ fontStyle: 'italic', color: 'var(--ink)', fontSize: 15.5 }}>“{j.bestLine}”</p>
                  <p className="muted" style={{ marginTop: 8 }}>
                    — {j.handle} · {levels.find((l) => l.id === j.levelId)?.keeper.name} · {rupees(j.price)}
                  </p>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
