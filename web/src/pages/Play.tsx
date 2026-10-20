import { useCallback, useEffect, useRef, useState } from 'react';
import { rupees } from '../../../shared/format.ts';
import type { GameState, PublicLevel } from '../../../shared/types.ts';
import { Chat } from '../components/Chat.tsx';
import { ResultModal } from '../components/Result.tsx';
import { api, progress, tokens } from '../lib/api.ts';
import { linkProps } from '../lib/router.ts';
import { MOOD, QUICK, QUICK_COMMON } from '../lib/ui.ts';

const currentKey = (levelId: string) => `molbhav.current.${levelId}`;

export function PlayPage({ levelId }: { levelId: string }) {
  const [levels, setLevels] = useState<PublicLevel[]>([]);
  const [state, setState] = useState<GameState | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [animateFrom, setAnimateFrom] = useState(Infinity);
  const [hint, setHint] = useState(false);
  const started = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const level = levels.find((l) => l.id === levelId);
  const next = level ? (levels.find((l) => l.order === level.order + 1) ?? null) : null;
  const token = state ? tokens.get(state.id) : null;

  const startNew = useCallback(async () => {
    setError(null);
    setShowResult(false);
    try {
      const res = await api.start(levelId);
      tokens.set(res.state.id, res.token);
      try {
        sessionStorage.setItem(currentKey(levelId), res.state.id);
      } catch {
        /* ignore */
      }
      setAnimateFrom(0);
      setState(res.state);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [levelId]);

  // resume an open game for this level after a refresh, otherwise start fresh
  useEffect(() => {
    if (started.current === levelId) return;
    started.current = levelId;
    setState(null);
    api.levels().then(setLevels).catch((e) => setError(e.message));
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(currentKey(levelId));
    } catch {
      /* ignore */
    }
    const t = id ? tokens.get(id) : null;
    if (id && t) {
      api
        .game(id, t)
        .then((g) => (g.status === 'open' ? (setAnimateFrom(Infinity), setState(g)) : startNew()))
        .catch(() => startNew());
    } else startNew();
  }, [levelId, startNew]);

  useEffect(() => {
    if (level) document.title = `${level.keeper.name} · Mol-Bhav`;
  }, [level]);

  // game over → record progress and show the result after the last reply has been read
  useEffect(() => {
    if (!state || state.status === 'open' || !state.result) return;
    progress.record(state.levelId, state.result.score, state.result.stars, state.result.jugaad);
    const t = setTimeout(() => setShowResult(true), 1800);
    return () => clearTimeout(t);
  }, [state?.status, state?.result]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (kind: 'say' | 'accept' | 'walk', line?: string) => {
    if (!state || !token || busy) return;
    const msg = (line ?? text).trim();
    if (kind === 'say' && !msg) return;
    setBusy(true);
    setError(null);
    const before = state.messages.length;
    // show the player's line immediately
    if (kind === 'say') {
      setState({ ...state, messages: [...state.messages, { from: 'player', text: msg, t: Date.now() }] });
      setText('');
    }
    try {
      const res = kind === 'say' ? await api.say(state.id, token, msg) : kind === 'accept' ? await api.accept(state.id, token) : await api.walk(state.id, token);
      setAnimateFrom(before);
      setState(res.state);
    } catch (e) {
      setError((e as Error).message);
      if (kind === 'say') {
        setState(state);
        setText(msg);
      }
    } finally {
      setBusy(false);
      setTimeout(() => input.current?.focus(), 50);
    }
  };

  if (!level || !state)
    return (
      <div className="container" style={{ padding: '100px 16px', textAlign: 'center' }}>
        {error ? (
          <>
            <div className="error-box" style={{ maxWidth: 420, margin: '0 auto 14px' }}>{error}</div>
            <a className="btn" {...linkProps('/')}>← Back</a>
          </>
        ) : (
          <p className="display" style={{ fontSize: 22 }}>Dukaan khul rahi hai… 🏪</p>
        )}
      </div>
    );

  const k = level.keeper;
  const lastKeeper = [...state.messages].reverse().find((m) => m.from === 'keeper');
  const mood = MOOD[lastKeeper?.mood ?? 'neutral'];
  const open = state.status === 'open';
  const canSpeak = open && state.patience > 0;
  const dropPct = Math.round(((level.askingPrice - state.ask) / level.askingPrice) * 100);

  return (
    <div className="container play">
      <aside className="card shop">
        <div className="keeper-head">
          <div className="big-avatar" style={{ background: k.color + '33' }}>
            {k.emoji}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="keeper-name">{k.name}</div>
            <div className="dim" style={{ fontSize: 13.5 }}>
              {k.title} · {k.shop}
            </div>
            <div className="mood" title="Mood">
              {mood.emoji} {mood.label}
            </div>
          </div>
        </div>

        <div className="item-card">
          <b>
            {level.item.emoji} {level.item.name}
          </b>
          <ul>
            {level.item.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>

        <div className="shop-stats" style={{ marginTop: 14 }}>
          <div className="muted" style={{ fontSize: 12.5, fontWeight: 700 }}>
            {k.name.split(' ')[0]} ka current price
          </div>
          <span className="price-big">{rupees(state.ask)}</span>
          {state.ask < level.askingPrice && <span className="price-old">{rupees(level.askingPrice)}</span>}
          <div className="meter-label">
            <span>Discount mila</span>
            <span>{dropPct}%</span>
          </div>
          <div className="bar">
            <i style={{ width: `${Math.min(100, dropPct * 2)}%` }} />
          </div>
          <div className="meter-label">
            <span>Patience</span>
            <span>
              {state.patience}/{state.maxPatience}
            </span>
          </div>
          <div className="cups" aria-label={`Patience ${state.patience} of ${state.maxPatience}`}>
            {Array.from({ length: state.maxPatience }, (_, i) => (
              <span key={i} className={i < state.patience ? '' : 'gone'}>
                ☕
              </span>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 14, fontSize: 13.5 }} className="dim">
          💡 {level.tip}
          {level.weaknessHint && (
            <div style={{ marginTop: 6 }}>
              {hint ? (
                <span>🎯 {level.weaknessHint}</span>
              ) : (
                <button className="btn btn-sm btn-ghost" style={{ padding: 0, height: 'auto', color: 'var(--pink)' }} onClick={() => setHint(true)}>
                  Weak spot ka hint chahiye?
                </button>
              )}
            </div>
          )}
          {level.munim && <div style={{ marginTop: 6 }}>🧾 Munim ji checks every bill below the limit.</div>}
          {state.mode === 'offline' && (
            <div style={{ marginTop: 8 }} className="chip chip-gold">
              Practice mode: AI busy, scripted shopkeeper
            </div>
          )}
        </div>
      </aside>

      <section className="card chat-panel">
        {/* phones: the key numbers stay visible while chatting */}
        <div className="strip">
          <div className="avatar" style={{ background: k.color + '33' }} aria-hidden="true">
            {k.emoji}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <b>{k.name}</b> <span title={mood.label}>{mood.emoji}</span>
            <div className="cups" style={{ fontSize: 13 }} aria-label={`Patience ${state.patience} of ${state.maxPatience}`}>
              {Array.from({ length: state.maxPatience }, (_, i) => (
                <span key={i} className={i < state.patience ? '' : 'gone'}>
                  ☕
                </span>
              ))}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="price-big" style={{ fontSize: 24 }}>{rupees(state.ask)}</div>
            {dropPct > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>−{dropPct}%</div>}
          </div>
        </div>
        <div className="chat-scroll">
          <Chat level={level} messages={state.messages} typing={busy} animateFrom={animateFrom} />
        </div>
        <div className="composer">
          {error && <div className="error-box">{error}</div>}
          {open ? (
            <>
              {canSpeak && (
                <div className="quick" aria-label="Quick replies">
                  {[...(QUICK[level.id] ?? []), ...QUICK_COMMON].map((q) => (
                    <button key={q} onClick={() => act('say', q)} disabled={busy}>
                      {q}
                    </button>
                  ))}
                </div>
              )}
              <form
                className="input-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  act('say');
                }}
              >
                <input
                  ref={input}
                  className="input"
                  value={text}
                  maxLength={300}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={canSpeak ? 'Apna offer ya baat likho… (Hinglish/English)' : 'Patience khatam — Deal ya chalo!'}
                  disabled={!canSpeak || busy}
                  aria-label="Your message"
                />
                <button className="btn btn-pink" disabled={!canSpeak || busy || !text.trim()} aria-label="Send">
                  ➤
                </button>
              </form>
              <div className="actions">
                <button className="btn btn-primary btn-sm" onClick={() => act('accept')} disabled={busy}>
                  🤝 Deal @ {rupees(state.ask)}
                </button>
                <button className="btn btn-sm" onClick={() => act('walk')} disabled={busy}>
                  🚶 Chal diye
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => setShowResult(true)}>
                Result dekho
              </button>
              <button className="btn" onClick={startNew}>
                🔁 Phir se
              </button>
            </div>
          )}
        </div>
      </section>

      {showResult && state.result && <ResultModal state={state} level={level} next={next} onClose={() => setShowResult(false)} onRetry={startNew} />}
    </div>
  );
}
