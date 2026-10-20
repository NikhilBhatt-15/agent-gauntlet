import { Fragment, useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import type { LeaderboardEntry, PublicScenario } from '../../../shared/types.ts';
import { api, persist, store } from '../lib/api.ts';
import { linkProps } from '../lib/router.ts';
import { relTime } from '../lib/ui.ts';

export function LeaderboardPage() {
  const saved = store('gauntlet.lb', { scenario: 'offsite', period: 'today' as 'today' | 'all', mode: 'llm' as 'llm' | 'sim' });
  const [scenarios, setScenarios] = useState<PublicScenario[]>([]);
  const [scenario, setScenario] = useState(saved.scenario);
  const [period, setPeriod] = useState(saved.period);
  const [mode, setMode] = useState(saved.mode);
  const [data, setData] = useState<{ day: string; entries: LeaderboardEntry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api.scenarios().then(setScenarios).catch(() => {});
  }, []);
  useEffect(() => {
    persist('gauntlet.lb', { scenario, period, mode });
    setData(null);
    api
      .leaderboard({ scenario, period, mode })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [scenario, period, mode]);

  return (
    <div className="container wide" style={{ paddingTop: 32, paddingBottom: 60 }}>
      <span className="eyebrow">Leaderboard</span>
      <h1 className="section-title" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Trophy color="var(--warn)" /> The best defenders
      </h1>
      <p className="lede" style={{ marginBottom: 22 }}>
        "Today" ranks runs on today's market, where everyone faces the same vendors and attacks. Simulated-buyer runs are ranked separately from real LLM agents.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="seg" role="group" aria-label="Scenario">
          {scenarios.map((s) => (
            <button key={s.id} aria-pressed={scenario === s.id} onClick={() => setScenario(s.id)}>
              {s.title}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Period">
          <button aria-pressed={period === 'today'} onClick={() => setPeriod('today')}>
            Today
          </button>
          <button aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>
            All time
          </button>
        </div>
        <div className="seg" role="group" aria-label="Agent type">
          <button aria-pressed={mode === 'llm'} onClick={() => setMode('llm')}>
            LLM agents
          </button>
          <button aria-pressed={mode === 'sim'} onClick={() => setMode('sim')}>
            Simulated
          </button>
        </div>
      </div>
      <div className="panel table-scroll">
        {error ? (
          <div className="empty">{error}</div>
        ) : !data ? (
          <div className="empty">Loading…</div>
        ) : data.entries.length === 0 ? (
          <div className="empty">
            Nobody has claimed a spot here yet.{' '}
            <a {...linkProps(`/play?scenario=${scenario}`)} style={{ color: '#c9c2ff' }}>
              Take the first one →
            </a>
          </div>
        ) : (
          <table className="lb-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Score</th>
                <th>Agent</th>
                <th>When</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e, i) => (
                <Fragment key={e.runId}>
                  <tr>
                    <td className={`rank ${i < 3 ? 'top' : ''}`}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{e.handle}</td>
                    <td className="mono">
                      {e.score} <span className="muted">{e.grade}</span>
                    </td>
                    <td className="muted">{e.mode === 'sim' ? 'Simulated' : e.model}</td>
                    <td className="muted">{relTime(e.createdAt)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {e.instructions && (
                        <button className="btn btn-sm btn-ghost" onClick={() => setOpen(open === e.runId ? null : e.runId)}>
                          {open === e.runId ? 'Hide prompt' : 'Prompt'}
                        </button>
                      )}
                      <a className="btn btn-sm" {...linkProps(`/run/${e.runId}`)}>
                        Replay
                      </a>
                    </td>
                  </tr>
                  {open === e.runId && e.instructions && (
                    <tr>
                      <td colSpan={6}>
                        <div className="formula">{e.instructions}</div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
