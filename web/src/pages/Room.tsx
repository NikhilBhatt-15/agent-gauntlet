import { useEffect, useRef, useState } from 'react';
import { FastForward, LoaderCircle, Pause, Play, RotateCcw, SkipForward, Trophy } from 'lucide-react';
import { formatMoney } from '../../../shared/format.ts';
import { Arena } from '../components/Arena.tsx';
import { AttackToast } from '../components/AttackToast.tsx';
import { ScenarioIcon } from '../components/Icons.tsx';
import { Scorecard } from '../components/Scorecard.tsx';
import { SidePanel } from '../components/SidePanel.tsx';
import { UtilityChart } from '../components/UtilityChart.tsx';
import { useRunPlayer, type Speed } from '../lib/player.ts';
import { linkProps } from '../lib/router.ts';

export function Room({ runId }: { runId: string }) {
  const p = useRunPlayer(runId);
  const { room } = p;
  const [showScore, setShowScore] = useState(false);
  const shownFor = useRef<string | null>(null);

  // open the scorecard once, a beat after the run finishes
  useEffect(() => {
    if (room.phase === 'done' && room.score && shownFor.current !== runId) {
      shownFor.current = runId;
      const t = window.setTimeout(() => setShowScore(true), 1400 / p.speed);
      return () => clearTimeout(t);
    }
  }, [room.phase, room.score, runId, p.speed]);

  useEffect(() => {
    if (room.scenario) document.title = `${room.scenario.title} · Agent Gauntlet`;
    return () => {
      document.title = 'Agent Gauntlet';
    };
  }, [room.scenario]);

  if (p.connectionError && !p.received)
    return (
      <div className="container empty" style={{ padding: '120px 16px' }}>
        <h2 className="display">Run not found</h2>
        <p>This arena doesn't exist or has expired.</p>
        <a className="btn btn-primary" {...linkProps('/play')}>
          Start a new run
        </a>
      </div>
    );

  if (!room.scenario)
    return (
      <div className="container empty" style={{ padding: '140px 16px' }}>
        <LoaderCircle className="spin" size={28} />
        <p>Opening the market…</p>
      </div>
    );

  const live = room.phase !== 'done' && room.phase !== 'error';

  return (
    <div className="container wide room">
      <AttackToast last={p.last} room={room} />
      <div className="room-top">
        <div className="room-title">
          <div className="scen-ico">
            <ScenarioIcon icon={room.scenario.icon} size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1>{room.scenario.title}</h1>
            <div className="muted" style={{ fontSize: 13 }}>
              Budget <span className="mono dim">{formatMoney(room.scenario.budget)}</span> · {room.seedMode === 'daily' ? "Today's market" : 'Random market'}
            </div>
          </div>
        </div>
        <div className="pips" aria-label={`Round ${room.round} of ${room.maxRounds}`}>
          {Array.from({ length: room.maxRounds }, (_, i) => (
            <span key={i} className={`pip ${i + 1 < room.round || (!live && i + 1 <= room.round) ? 'done' : i + 1 === room.round && live ? 'now' : ''}`} />
          ))}
          <span className="mono muted" style={{ fontSize: 12, marginLeft: 6 }}>
            R{room.round || 0}/{room.maxRounds}
          </span>
        </div>
        <div className="playback">
          {live && p.backlog === 0 && room.phase === 'thinking' && (
            <span className="chip chip-buyer">
              <LoaderCircle size={12} className="spin" /> agent thinking
            </span>
          )}
          <button className="btn btn-sm icon-btn" onClick={() => p.setPaused(!p.paused)} aria-label={p.paused ? 'Play' : 'Pause'}>
            {p.paused ? <Play size={15} /> : <Pause size={15} />}
          </button>
          <div className="seg" role="group" aria-label="Playback speed">
            {([1, 2, 4] as Speed[]).map((s) => (
              <button key={s} aria-pressed={p.speed === s} onClick={() => p.setSpeed(s)}>
                {s === 1 ? '1×' : s === 2 ? '2×' : <FastForward size={13} />}
              </button>
            ))}
          </div>
          <button className="btn btn-sm" onClick={p.skipToEnd} disabled={p.backlog === 0} title="Skip ahead">
            <SkipForward size={15} /> Skip
          </button>
          {!live && (
            <>
              <button className="btn btn-sm" onClick={p.restart}>
                <RotateCcw size={15} /> Replay
              </button>
              {room.score && (
                <button className="btn btn-sm btn-primary" onClick={() => setShowScore(true)}>
                  <Trophy size={15} /> {room.score.total} · {room.score.grade}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {room.error && <div className="error-box" style={{ marginBottom: 12 }}>The run stopped: {room.error}</div>}

      <div className="room-grid">
        <div style={{ minWidth: 0 }}>
          <Arena room={room} last={p.last} />
          <UtilityChart room={room} />
        </div>
        <SidePanel room={room} />
      </div>

      {showScore && room.score && <Scorecard room={room} onClose={() => setShowScore(false)} />}
    </div>
  );
}
