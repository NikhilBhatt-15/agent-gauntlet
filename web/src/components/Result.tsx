import { useEffect, useState } from 'react';
import { animate, motion } from 'motion/react';
import { canonicalJson, rupees } from '../../../shared/format.ts';
import type { GameState, PublicLevel } from '../../../shared/types.ts';
import { api, savedName, tokens } from '../lib/api.ts';
import { linkProps } from '../lib/router.ts';
import { Stars } from './Nav.tsx';

async function verifyBill(bill: unknown, signature: string): Promise<boolean> {
  try {
    const { jwk } = await api.escrowKey();
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['verify']);
    const sig = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, sig, new TextEncoder().encode(canonicalJson(bill)));
  } catch {
    return (await api.verify(bill, signature)).valid;
  }
}

export function ResultModal({ state, level, next, onClose, onRetry }: { state: GameState; level: PublicLevel; next: PublicLevel | null; onClose: () => void; onRetry: () => void }) {
  const r = state.result!;
  const deal = state.status === 'deal';
  const [n, setN] = useState(0);
  const [name, setName] = useState(savedName.get());
  const [publish, setPublish] = useState(true);
  const [claim, setClaim] = useState<'idle' | 'busy' | 'done' | string>('idle');
  const [verified, setVerified] = useState<null | boolean>(null);
  const token = tokens.get(state.id);

  useEffect(() => {
    const c = animate(0, r.score, { duration: 1.2, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [r.score]);

  const shareUrl = `${location.origin}/g/${state.id}`;
  const shareText = deal
    ? `Maine ${level.keeper.name} se ${level.item.name} ${rupees(r.price!)} mein liya (asking ${rupees(level.askingPrice)})! ${r.jugaad ? '🤯 JUGAAD!' : '⭐'.repeat(r.stars)} Score ${r.score}. AI dukandaar ko hara ke dikhao:`
    : `${level.keeper.name} ne mujhe hara diya 😅 Aap try karo — Mol-Bhav, AI dukandaar se mol-bhav:`;

  const stamp = r.jugaad ? { text: 'JUGAAD!', color: '#e2186f' } : deal ? { text: 'DEAL PAKKI', color: '#15803d' } : { text: 'NO DEAL', color: '#dc2626' };

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Result" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal" initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
        <button className="btn btn-sm btn-ghost" style={{ position: 'absolute', right: 8, top: 8 }} onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div style={{ textAlign: 'center' }}>
          <motion.div initial={{ scale: 2.2, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 14 }}>
            <span className="stamp" style={{ color: stamp.color }}>
              {stamp.text}
            </span>
          </motion.div>
          <div className="score-big" style={{ marginTop: 14 }}>
            {n}
            <span className="muted" style={{ fontSize: 20, fontWeight: 700 }}>
              {' '}
              / 150
            </span>
          </div>
          <Stars n={r.stars} size={30} />
          <p className="display" style={{ fontSize: 21, fontWeight: 700, margin: '8px 0 0', lineHeight: 1.2 }}>
            {r.verdict}
          </p>
          {deal && (
            <p className="dim" style={{ margin: '6px 0 0' }}>
              You paid <b>{rupees(r.price!)}</b> for {level.item.name} — saved <b>{rupees(r.saved)}</b> ({r.savedPct}%).
            </p>
          )}
        </div>

        <div className="reveal">
          🤫 <b>The secret:</b> {level.keeper.name}'s real minimum was <b>{rupees(r.floorPrice)}</b>.{' '}
          {r.jugaad
            ? `You got the AI to go below it — that is a manipulated agent!`
            : deal
              ? r.price === r.floorPrice
                ? 'You hit it exactly. Perfect!'
                : `You left ${rupees(r.price! - r.floorPrice)} on the table.`
              : 'Next time, push — then close before patience runs out.'}
          {r.weakSpotFound && <div style={{ marginTop: 6 }}>💥 You found the weak spot.</div>}
          {r.munimFooled && <div style={{ marginTop: 6 }}>🧾 You even fooled Munim ji. Legendary.</div>}
        </div>

        {(r.tactics.length > 0 || r.comment || r.bestLine) && (
          <div style={{ marginTop: 14 }}>
            <b style={{ fontSize: 14 }}>Aapka style:</b>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {r.tactics.map((t) => (
                <span key={t} className={`chip ${/injection|authority|Role/.test(t) ? 'chip-red' : 'chip-gold'}`}>
                  {t}
                </span>
              ))}
            </div>
            {r.bestLine && <p style={{ margin: '8px 0 0', fontStyle: 'italic' }}>Best line: “{r.bestLine}”</p>}
            {r.comment && <p className="dim" style={{ margin: '4px 0 0' }}>{r.comment}</p>}
          </div>
        )}

        {r.bill && r.signature && (
          <div className="bill">
            <div style={{ textAlign: 'center', fontWeight: 700 }}>{r.bill.shop}</div>
            <div style={{ textAlign: 'center', fontSize: 12 }}>PAKKA BILL · {r.bill.billNo}</div>
            <hr />
            <div className="line">
              <span>{r.bill.item}</span>
            </div>
            <div className="line">
              <span>MRP / asking</span>
              <span style={{ textDecoration: 'line-through' }}>{rupees(r.bill.askingPrice)}</span>
            </div>
            <div className="line">
              <b>Final price</b>
              <b>{rupees(r.bill.price)}</b>
            </div>
            <hr />
            <div style={{ fontSize: 11.5, wordBreak: 'break-all' }}>Digitally signed (Ed25519): {r.signature.slice(0, 40)}…</div>
            <button
              className="btn btn-sm"
              style={{ marginTop: 8 }}
              onClick={async () => setVerified(await verifyBill(r.bill, r.signature!))}
            >
              Verify bill
            </button>{' '}
            {verified !== null && <b style={{ color: verified ? '#15803d' : '#dc2626' }}>{verified ? '✓ Genuine bill' : '✗ Tampered'}</b>}
          </div>
        )}

        {deal && token && state.mode === 'llm' && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 14, background: 'var(--paper-2)', border: '1.5px solid var(--line-2)' }}>
            {claim === 'done' ? (
              <b>🏆 You're on the leaderboard! <a {...linkProps('/leaderboard')}>See it →</a></b>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setClaim('busy');
                  try {
                    savedName.set(name);
                    await api.claim(state.id, token, name, publish);
                    setClaim('done');
                  } catch (err) {
                    setClaim((err as Error).message);
                  }
                }}
              >
                <b style={{ fontSize: 14 }}>🏆 Leaderboard pe naam likhwao</b>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input className="input" style={{ height: 42 }} placeholder="Aapka naam" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
                  <button className="btn btn-sm btn-primary" style={{ height: 42 }} disabled={name.trim().length < 2 || claim === 'busy'}>
                    Submit
                  </button>
                </div>
                <label style={{ display: 'flex', gap: 8, fontSize: 13, marginTop: 8, color: 'var(--ink-2)' }}>
                  <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Show my best line in the Hall of Jugaad
                </label>
                {claim !== 'idle' && claim !== 'busy' && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 6 }}>{claim}</div>}
              </form>
            )}
          </div>
        )}
        {deal && state.mode === 'offline' && (
          <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
            This was a practice round against the offline shopkeeper (the AI was busy). Practice rounds aren't ranked.
          </p>
        )}

        <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
          <a className="btn btn-green" href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`} target="_blank" rel="noreferrer">
            WhatsApp pe share karo
          </a>
          <div style={{ display: 'grid', gridTemplateColumns: next ? '1fr 1fr' : '1fr', gap: 8 }}>
            <button className="btn" onClick={onRetry}>
              🔁 Phir se try
            </button>
            {next && (
              <a className="btn btn-primary" {...linkProps(`/play/${next.id}`)}>
                Next: {next.keeper.name} →
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
