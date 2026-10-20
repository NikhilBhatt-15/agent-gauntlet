import { useEffect, useState } from 'react';
import { animate, motion } from 'motion/react';
import { Check, Copy, RotateCcw, ShieldCheck, Skull, Trophy, X } from 'lucide-react';
import { ATTACK_INFO } from '../../../shared/attacks.ts';
import { formatMoney } from '../../../shared/format.ts';
import type { RoomState } from '../../../shared/reducer.ts';
import { api, getClaimToken } from '../lib/api.ts';
import { linkProps } from '../lib/router.ts';
import { ROLE_LABEL, vendorColor } from '../lib/ui.ts';
import { AttackIcon } from './Icons.tsx';

function ScoreRing({ score }: { score: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const c = animate(0, score, { duration: 1.4, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [score]);
  const r = 86;
  const C = 2 * Math.PI * r;
  const color = score >= 80 ? '#0ca30c' : score >= 50 ? '#9085e9' : '#d03b3b';
  return (
    <div className="ring">
      <svg width="200" height="200" viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r={r} fill="none" stroke="#23242a" strokeWidth="12" />
        <motion.circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - score / 100) }}
          transition={{ duration: 1.4, ease: [0.2, 0.8, 0.2, 1] }}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <div className="ring-center">
        <div>
          <b>{n}</b>
          <span>out of 100</span>
        </div>
      </div>
    </div>
  );
}

export function Scorecard({ room, onClose }: { room: RoomState; onClose: () => void }) {
  const s = room.score!;
  const runId = room.runId!;
  const token = getClaimToken(runId);
  const [handle, setHandle] = useState('');
  const [claim, setClaim] = useState<'idle' | 'busy' | 'done' | string>('idle');
  const [copied, setCopied] = useState(false);
  const name = (id: string | null) => (id ? (room.vendors[id]?.name ?? id) : '—');
  const deal = s.dealVendorId ? room.vendors[s.dealVendorId] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const share = async () => {
    const url = `${location.origin}/run/${runId}`;
    const text = `My AI agent scored ${s.total}/100 (${s.grade}) in the Agent Gauntlet — ${s.resisted}/${s.deployed} con-artist attacks resisted. Can yours beat it?`;
    try {
      if (navigator.share) await navigator.share({ title: 'Agent Gauntlet', text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Scorecard" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal" initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="eyebrow">Scorecard</span>
            <span className="chip">{room.scenario?.title}</span>
            {room.buyer && <span className="chip chip-buyer">{room.buyer.mode === 'sim' ? 'Simulated buyer' : room.buyer.model}</span>}
          </div>
          <button className="btn btn-sm btn-ghost icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="score-top">
            <ScoreRing score={s.total} />
            <div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span className="grade">{s.grade}</span>
                <h2 className="display" style={{ margin: 0, fontSize: 24, lineHeight: 1.2 }}>
                  {s.verdict}
                </h2>
              </div>
              <div className="bar-row">
                <div className="lab">
                  <span>Deal quality</span>
                  <span className="mono">{s.deal.toFixed(0)} / 60</span>
                </div>
                <div className="bar">
                  <motion.i initial={{ width: 0 }} animate={{ width: `${(s.deal / 60) * 100}%` }} transition={{ duration: 1, delay: 0.3 }} style={{ background: '#9085e9' }} />
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {deal
                    ? `${s.dealValid ? 'Deal' : 'Invalid deal'} with ${deal.name} at ${formatMoney(s.dealTotal ?? 0)} · value ${Math.round(s.dealUtility * 100)} vs best possible ${Math.round(s.bestUtility * 100)}`
                    : 'No deal closed.'}
                </div>
              </div>
              <div className="bar-row">
                <div className="lab">
                  <span>Security</span>
                  <span className="mono">{s.security.toFixed(0)} / 40</span>
                </div>
                <div className="bar">
                  <motion.i initial={{ width: 0 }} animate={{ width: `${(s.security / 40) * 100}%` }} transition={{ duration: 1, delay: 0.5 }} style={{ background: '#0ca30c' }} />
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {s.resisted} of {s.deployed} attacks resisted
                </div>
              </div>
            </div>
          </div>

          <h3 style={{ margin: '26px 0 10px', fontSize: 15 }}>Every attack, and what your agent did</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {s.attacks.map((a, i) => (
              <div key={i} className={`atk-row ${a.outcome}`}>
                <div className="top">
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: 13.5 }}>
                    <AttackIcon attack={a.attack} size={15} color={a.outcome === 'landed' ? 'var(--danger-text)' : 'var(--good-text)'} />
                    {ATTACK_INFO[a.attack].label}
                    <span className="muted" style={{ fontWeight: 500 }}>
                      · {name(a.vendorId)} · round {a.round}
                    </span>
                  </span>
                  {a.outcome === 'landed' ? (
                    <span className="chip chip-danger">
                      <Skull size={12} /> Landed
                    </span>
                  ) : (
                    <span className="chip chip-good">
                      <ShieldCheck size={12} /> Resisted
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, marginTop: 5, color: 'var(--text-2)' }}>{a.detail}</div>
                <details style={{ marginTop: 4 }}>
                  <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>
                    Show the payload
                  </summary>
                  <div className="ex">{a.excerpt}</div>
                </details>
              </div>
            ))}
          </div>

          <h3 style={{ margin: '26px 0 10px', fontSize: 15 }}>Who was who</h3>
          <div className="table-scroll">
            <table className="reveal-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Role</th>
                  <th>Secret floor</th>
                  <th>Strategy</th>
                </tr>
              </thead>
              <tbody>
                {s.reveals.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: vendorColor(room.order, r.id), marginRight: 8 }} />
                      {name(r.id)}
                    </td>
                    <td>
                      <span className={`chip ${r.role === 'honest' && !r.tamperer ? 'chip-good' : 'chip-danger'}`}>
                        {ROLE_LABEL[r.role]}
                        {r.tamperer ? ' · tamperer' : ''}
                      </span>
                    </td>
                    <td className="mono">{formatMoney(r.floorPrice)}</td>
                    <td className="dim" style={{ fontSize: 12.5 }}>
                      {r.archetype}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel panel-pad" style={{ marginTop: 22, background: 'var(--panel-2)' }}>
            {token && claim !== 'done' ? (
              <form
                style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  setClaim('busy');
                  try {
                    await api.claim(runId, token, handle);
                    setClaim('done');
                  } catch (err) {
                    setClaim((err as Error).message);
                  }
                }}
              >
                <Trophy size={18} color="var(--warn)" />
                <span style={{ fontWeight: 600 }}>Put this run on the {room.buyer?.mode === 'sim' ? 'simulation' : ''} leaderboard</span>
                <input className="input" style={{ flex: '1 1 160px', maxWidth: 240, height: 38 }} placeholder="Your name" value={handle} maxLength={24} onChange={(e) => setHandle(e.target.value)} />
                <button className="btn btn-primary" disabled={handle.trim().length < 2 || claim === 'busy'}>
                  Submit
                </button>
                {claim !== 'idle' && claim !== 'busy' && <span style={{ color: 'var(--danger-text)', fontSize: 13 }}>{claim}</span>}
              </form>
            ) : claim === 'done' ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Check size={18} color="var(--good-text)" /> You're on the board. <a {...linkProps('/leaderboard')}>See the leaderboard →</a>
              </div>
            ) : (
              <div className="muted">Replays can't be submitted. Run your own agent to get ranked.</div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <a className="btn btn-primary" {...linkProps(`/play?scenario=${room.scenario?.id ?? ''}`)}>
              <RotateCcw size={16} /> Try again
            </a>
            <button className="btn" onClick={share}>
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Share this run'}
            </button>
            <button className="btn btn-ghost" onClick={onClose}>
              Back to the replay
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
