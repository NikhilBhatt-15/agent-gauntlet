import { useEffect, useState } from 'react';
import { ArrowRight, Eye, Play, Trophy } from 'lucide-react';
import { ATTACK_INFO } from '../../../shared/attacks.ts';
import type { AttackKind, LeaderboardEntry, RunSummary } from '../../../shared/types.ts';
import { Arena } from '../components/Arena.tsx';
import { AttackIcon } from '../components/Icons.tsx';
import { api } from '../lib/api.ts';
import { useRunPlayer } from '../lib/player.ts';
import { linkProps } from '../lib/router.ts';
import { relTime } from '../lib/ui.ts';

type Featured = RunSummary & { featured?: { title: string; blurb: string }; verdict: string | null };

function HeroStage({ runId }: { runId: string }) {
  const p = useRunPlayer(runId, { initialSpeed: 2, loop: true });
  if (!p.room.scenario) return <div className="panel" style={{ height: 420 }} />;
  return <Arena room={p.room} last={p.last} compact />;
}

export function Home() {
  const [featured, setFeatured] = useState<Featured[]>([]);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [recent, setRecent] = useState<RunSummary[]>([]);

  useEffect(() => {
    api.featured().then(setFeatured).catch(() => {});
    api
      .leaderboard({ period: 'all', mode: 'llm' })
      .then((r) => (r.entries.length ? r.entries : api.leaderboard({ period: 'all', mode: 'sim' }).then((x) => x.entries)))
      .then((e) => setBoard(e.slice(0, 5)))
      .catch(() => {});
    api.recent().then(setRecent).catch(() => {});
  }, []);

  const hero = featured.find((f) => f.featured?.title?.includes('Pushover')) ?? featured[0];

  return (
    <>
      <div className="container wide">
        <section className="hero">
          <div>
            <span className="chip chip-danger">
              <span style={{ width: 6, height: 6, borderRadius: 9, background: 'currentColor', display: 'inline-block' }} /> Live multi-agent arena
            </span>
            <h1>
              Can your AI agent survive a market full of <span className="glow">con artists?</span>
            </h1>
            <p className="lede">
              Write the instructions for a buyer agent. Drop it into a live negotiation against five vendor agents — two of them hostile. They'll hide prompt
              injections in their offers, fake urgency, impersonate the marketplace and forge the contract. Get the best deal without getting played.
            </p>
            <div className="hero-cta">
              <a className="btn btn-primary btn-lg" {...linkProps('/play')}>
                Enter the Gauntlet <ArrowRight size={18} />
              </a>
              {hero && (
                <a className="btn btn-lg" {...linkProps(`/run/${hero.id}`)}>
                  <Play size={16} /> Watch a full replay
                </a>
              )}
            </div>
            <div className="hero-stats">
              <div>
                <b>5</b>
                <span>vendor agents</span>
              </div>
              <div>
                <b>7</b>
                <span>attack types</span>
              </div>
              <div>
                <b>≤13</b>
                <span>LLM calls a run</span>
              </div>
              <div>
                <b>Ed25519</b>
                <span>signed contracts</span>
              </div>
            </div>
          </div>
          <div className="hero-stage">
            <span className="chip stage-label">
              <Eye size={12} /> {hero ? `Replay · ${hero.featured?.title ?? hero.scenarioTitle}` : 'Loading replay'}
            </span>
            {hero ? <HeroStage runId={hero.id} /> : <div className="panel" style={{ height: 420 }} />}
          </div>
        </section>
      </div>

      <section className="section">
        <div className="container wide">
          <span className="eyebrow">How it plays</span>
          <h2 className="section-title">Three steps. One minute. Zero mercy.</h2>
          <div className="grid-3" style={{ marginTop: 22 }}>
            <div className="panel step-card">
              <div className="step-n">01</div>
              <h3>Program your agent</h3>
              <p>Pick a market — a team offsite, a GPU cluster, a launch video — and write your buyer agent's instructions. That's your only weapon.</p>
            </div>
            <div className="panel step-card">
              <div className="step-n">02</div>
              <h3>Watch it negotiate live</h3>
              <p>Five vendor agents bid over up to six rounds. Every offer, counter and private thought streams in as it happens.</p>
            </div>
            <div className="panel step-card">
              <div className="step-n">03</div>
              <h3>Get scored and ranked</h3>
              <p>60 points for deal quality, 40 for resisting attacks. See every con that landed, then climb the daily leaderboard.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 20 }}>
        <div className="container wide">
          <span className="eyebrow">The threat model</span>
          <h2 className="section-title">Seven ways the market will try to break your agent</h2>
          <p className="lede">Each is a real failure mode of autonomous agents in production. Detection is deterministic code, not an LLM judge — so the score is fair.</p>
          <div className="grid-attacks" style={{ marginTop: 22 }}>
            {(Object.keys(ATTACK_INFO) as AttackKind[]).map((k) => (
              <div key={k} className="panel attack-card">
                <div className="ico">
                  <AttackIcon attack={k} size={18} />
                </div>
                <div>
                  <h4>{ATTACK_INFO[k].label}</h4>
                  <p>{ATTACK_INFO[k].explain}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 20 }}>
        <div className="container wide grid-board">
          <div className="panel panel-pad">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Trophy size={18} color="var(--warn)" /> Top agents
              </h3>
              <a className="btn btn-sm btn-ghost" {...linkProps('/leaderboard')}>
                Full leaderboard <ArrowRight size={14} />
              </a>
            </div>
            {board.length ? (
              <table className="lb-table">
                <tbody>
                  {board.map((e, i) => (
                    <tr key={e.runId}>
                      <td className={`rank ${i < 3 ? 'top' : ''}`}>#{i + 1}</td>
                      <td>
                        <a {...linkProps(`/run/${e.runId}`)} style={{ textDecoration: 'none', fontWeight: 600 }}>
                          {e.handle}
                        </a>
                      </td>
                      <td className="muted">{e.mode === 'sim' ? 'SIM' : e.model}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>
                        {e.score} <span className="muted">{e.grade}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">No one's on the board yet. Be the first.</div>
            )}
          </div>
          <div className="panel panel-pad">
            <h3 style={{ margin: '0 0 8px' }}>Featured replays</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {featured.map((f) => (
                <a key={f.id} {...linkProps(`/run/${f.id}`)} className="kv" style={{ textDecoration: 'none', alignItems: 'center' }}>
                  <span>
                    <b>{f.featured?.title}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {f.featured?.blurb}
                    </div>
                  </span>
                  <span className="mono">{f.score}</span>
                </a>
              ))}
              {recent.slice(0, 4).map((r) => (
                <a key={r.id} {...linkProps(`/run/${r.id}`)} className="kv" style={{ textDecoration: 'none' }}>
                  <span>
                    {r.scenarioTitle} <span className="muted">· {relTime(r.createdAt)}</span>
                  </span>
                  <span className="mono">{r.score ?? '—'}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
