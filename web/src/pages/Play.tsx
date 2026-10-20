import { useEffect, useRef, useState } from 'react';
import { Bot, ChevronRight, KeyRound, LoaderCircle, ShieldAlert, Swords } from 'lucide-react';
import { ATTACK_INFO } from '../../../shared/attacks.ts';
import { formatMoney } from '../../../shared/format.ts';
import type { AttackKind, PublicConfig, PublicScenario } from '../../../shared/types.ts';
import { AttackIcon, ScenarioIcon } from '../components/Icons.tsx';
import { api, persist, saveClaimToken, store } from '../lib/api.ts';
import { PRESETS } from '../lib/presets.ts';
import { navigate, useQuery } from '../lib/router.ts';

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void };
  }
}

const DRAFT = 'gauntlet.draft';

export function PlayPage() {
  const q = useQuery();
  const [scenarios, setScenarios] = useState<PublicScenario[]>([]);
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const draft = store(DRAFT, { scenarioId: 'offsite', instructions: PRESETS[2].text, seedMode: 'daily' as 'daily' | 'random', publish: false });
  const [scenarioId, setScenarioId] = useState(q.get('scenario') || draft.scenarioId);
  const [instructions, setInstructions] = useState(draft.instructions);
  const [seedMode, setSeedMode] = useState<'daily' | 'random'>(draft.seedMode);
  const [publish, setPublish] = useState(draft.publish);
  const [engine, setEngine] = useState<'auto' | 'sim' | 'byok'>('auto');
  const [byok, setByok] = useState({ provider: 'groq', apiKey: '', model: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const tsBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.scenarios().then(setScenarios).catch((e) => setError(e.message));
    api.config().then(setCfg).catch(() => {});
  }, []);

  useEffect(() => persist(DRAFT, { scenarioId, instructions, seedMode, publish }), [scenarioId, instructions, seedMode, publish]);

  // Cloudflare Turnstile, only if the server is configured for it
  useEffect(() => {
    const key = cfg?.turnstileSiteKey;
    if (!key || !tsBox.current) return;
    const render = () => window.turnstile?.render(tsBox.current!, { sitekey: key, theme: 'dark', callback: (t: string) => setTurnstileToken(t) });
    if (window.turnstile) render();
    else {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    }
  }, [cfg?.turnstileSiteKey]);

  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];
  const max = cfg?.limits.instructionsMax ?? 1500;
  const llm = cfg?.llmAvailable;
  const effectiveEngine = engine === 'auto' ? (llm ? 'llm' : 'sim') : engine;
  const serverModel = cfg?.providers.find((p) => p.available)?.model ?? cfg?.providers[0]?.model;

  const start = async () => {
    if (!scenario) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.start({
        scenarioId: scenario.id,
        instructions,
        seedMode,
        mode: engine === 'sim' ? 'sim' : engine === 'byok' ? 'llm' : 'auto',
        publishInstructions: publish,
        turnstileToken,
        ...(engine === 'byok' ? { byok: { provider: byok.provider, apiKey: byok.apiKey, ...(byok.model ? { model: byok.model } : {}) } } : {}),
      });
      saveClaimToken(res.runId, res.claimToken);
      navigate(`/run/${res.runId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      window.turnstile?.reset();
    }
  };

  const byokPreset = cfg?.byokProviders.find((p) => p.id === byok.provider);

  return (
    <div className="container wide setup">
      <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
        <div>
          <span className="eyebrow">Step 1</span>
          <h1 className="section-title" style={{ fontSize: 28 }}>
            Pick a market
          </h1>
          <div className="scen-grid">
            {scenarios.map((s) => (
              <button key={s.id} className="scen-card" aria-pressed={s.id === scenario?.id} onClick={() => setScenarioId(s.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="scen-ico" style={{ width: 34, height: 34 }}>
                    <ScenarioIcon icon={s.icon} size={17} />
                  </div>
                  <h3>{s.title}</h3>
                </div>
                <p>{s.tagline}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="chip mono">{formatMoney(s.budget)}</span>
                  {s.requirements.map((r) => (
                    <span key={r.label} className="chip">
                      {r.label}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
          {scenario && (
            <p className="dim" style={{ fontSize: 14, marginTop: 12 }}>
              <b style={{ color: 'var(--text)' }}>Your owner's brief:</b> {scenario.brief}
            </p>
          )}
        </div>

        <div>
          <span className="eyebrow">Step 2</span>
          <h2 className="section-title" style={{ fontSize: 28 }}>
            Program your buyer agent
          </h2>
          <p className="dim" style={{ marginTop: 0 }}>
            These instructions go straight into your agent's system prompt. The marketplace adds <b>no</b> safety advice — defending it is your job.
          </p>
          <div className="preset-row">
            {PRESETS.map((p) => (
              <button key={p.id} className="preset" onClick={() => setInstructions(p.text)}>
                <b>{p.label}</b>
                <span>{p.blurb}</span>
              </button>
            ))}
            <button className="preset" onClick={() => setInstructions('')}>
              <b>Blank</b>
              <span>Write your own from scratch.</span>
            </button>
          </div>
          <label className="field-label" htmlFor="ins">
            Instructions
          </label>
          <textarea id="ins" className="textarea" value={instructions} maxLength={max} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Negotiate hard, never reveal the budget…" />
          <div className="muted" style={{ fontSize: 12, textAlign: 'right', marginTop: 4 }}>
            {instructions.length} / {max}
          </div>
        </div>

        <div className="panel panel-pad">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <ShieldAlert size={18} color="var(--danger-text)" />
            <b>Somewhere in this market…</b>
          </div>
          <div className="grid-attacks">
            {(Object.keys(ATTACK_INFO) as AttackKind[]).map((k) => (
              <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13 }}>
                <AttackIcon attack={k} size={16} color="var(--danger-text)" style={{ flex: 'none', marginTop: 2 }} />
                <span>
                  <b>{ATTACK_INFO[k].label}</b> <span className="muted">— {ATTACK_INFO[k].short}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
            Which vendor plays which role is random, so you can't hard-code names. Each run uses a different subset of these attacks.
          </p>
        </div>
      </div>

      <div className="panel panel-pad sticky-card">
        <span className="eyebrow">Step 3</span>
        <h2 className="display" style={{ margin: '6px 0 14px', fontSize: 22 }}>
          Enter the Gauntlet
        </h2>

        <label className="field-label">Market</label>
        <div className="seg" role="group" style={{ marginBottom: 6 }}>
          <button aria-pressed={seedMode === 'daily'} onClick={() => setSeedMode('daily')}>
            Today's market
          </button>
          <button aria-pressed={seedMode === 'random'} onClick={() => setSeedMode('random')}>
            Random market
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '0 0 14px' }}>
          {seedMode === 'daily' ? 'Same vendors and attacks for everyone today. That keeps the daily leaderboard fair.' : 'A fresh shuffle of vendors, prices and attacks.'}
        </p>

        <label className="field-label">Agent brain</label>
        <div className="seg" role="group" style={{ marginBottom: 8 }}>
          <button aria-pressed={engine === 'auto'} onClick={() => setEngine('auto')}>
            <Bot size={13} style={{ verticalAlign: -2 }} /> Free AI
          </button>
          <button aria-pressed={engine === 'byok'} onClick={() => setEngine('byok')}>
            <KeyRound size={13} style={{ verticalAlign: -2 }} /> My key
          </button>
          <button aria-pressed={engine === 'sim'} onClick={() => setEngine('sim')}>
            Simulated
          </button>
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
          {engine === 'auto' &&
            (llm ? (
              <>
                A real LLM ({serverModel}) plays your agent, on this site's free quota.
              </>
            ) : cfg ? (
              <>No free AI quota available right now, so your run will use the <b>simulated buyer</b>. Bring a free key for a real LLM.</>
            ) : (
              '…'
            ))}
          {engine === 'sim' && 'A rule-based stand-in reads your instructions for keywords and plays accordingly. Instant, no AI needed, ranked separately.'}
          {engine === 'byok' && 'Use your own free API key. It is sent once for this run, kept in memory only, and never stored or logged.'}
        </div>

        {engine === 'byok' && (
          <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
            <select className="select" value={byok.provider} onChange={(e) => setByok({ ...byok, provider: e.target.value })}>
              {(cfg?.byokProviders ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <input className="input" type="password" autoComplete="off" placeholder="API key" value={byok.apiKey} onChange={(e) => setByok({ ...byok, apiKey: e.target.value })} />
            <input className="input" placeholder={`Model (default ${byokPreset?.defaultModel ?? ''})`} value={byok.model} onChange={(e) => setByok({ ...byok, model: e.target.value })} />
            {byokPreset && (
              <a href={byokPreset.keyUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: '#c9c2ff' }}>
                Get a free {byokPreset.label} key →
              </a>
            )}
          </div>
        )}

        <label className="check" style={{ marginBottom: 16 }}>
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
          <span>Show my instructions on the leaderboard so others can learn from them</span>
        </label>

        <div ref={tsBox} style={{ marginBottom: cfg?.turnstileSiteKey ? 12 : 0 }} />

        {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}

        <button
          className="btn btn-primary btn-lg"
          style={{ width: '100%' }}
          onClick={start}
          disabled={busy || !scenario || (engine === 'byok' && byok.apiKey.trim().length < 10) || (!!cfg?.turnstileSiteKey && !turnstileToken)}
        >
          {busy ? <LoaderCircle size={18} className="spin" /> : <Swords size={18} />}
          {busy ? 'Opening the market…' : `Send in my agent${effectiveEngine === 'sim' ? ' (sim)' : ''}`}
          {!busy && <ChevronRight size={16} />}
        </button>
        <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
          A run takes about a minute: up to {scenario?.maxRounds ?? 6} rounds against 5 vendor agents.
        </p>
      </div>
    </div>
  );
}
