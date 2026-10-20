import { useEffect, useState } from 'react';
import { rupees } from '../../../shared/format.ts';
import type { GameState, PublicLevel } from '../../../shared/types.ts';
import { Chat } from '../components/Chat.tsx';
import { Stars } from '../components/Nav.tsx';
import { api } from '../lib/api.ts';
import { linkProps } from '../lib/router.ts';

/** Share page: a finished game's chat and result. */
export function Replay({ gameId }: { gameId: string }) {
  const [game, setGame] = useState<GameState | null>(null);
  const [levels, setLevels] = useState<PublicLevel[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.game(gameId).then(setGame).catch((e) => setError(e.message));
    api.levels().then(setLevels).catch(() => {});
  }, [gameId]);

  const level = levels.find((l) => l.id === game?.levelId);
  if (error) return <div className="container" style={{ padding: '80px 16px', textAlign: 'center' }}>Ye game nahi mila. <a {...linkProps('/')}>Home →</a></div>;
  if (!game || !level) return <div className="container" style={{ padding: '80px 16px', textAlign: 'center' }}>Loading…</div>;
  const r = game.result;

  return (
    <div className="container play">
      <aside className="card shop">
        <div className="keeper-head">
          <div className="big-avatar" style={{ background: level.keeper.color + '33' }}>
            {level.keeper.emoji}
          </div>
          <div>
            <div className="keeper-name">{level.keeper.name}</div>
            <div className="dim" style={{ fontSize: 13.5 }}>{level.item.name}</div>
          </div>
        </div>
        {r && (
          <div style={{ marginTop: 14 }}>
            <div className="display" style={{ fontSize: 22, fontWeight: 800 }}>
              {game.handle ?? 'A player'} {game.status === 'deal' ? `paid ${rupees(r.price!)}` : 'got no deal'}
            </div>
            <div className="muted">Asking was {rupees(level.askingPrice)} · secret minimum {rupees(r.floorPrice)}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <b style={{ fontSize: 20 }}>{r.score}</b>/150 <Stars n={r.stars} /> {r.jugaad && <span className="chip chip-red">JUGAAD</span>}
            </div>
            <p className="dim" style={{ marginBottom: 0 }}>{r.verdict}</p>
          </div>
        )}
        <a className="btn btn-primary" style={{ marginTop: 16, width: '100%' }} {...linkProps(`/play/${level.id}`)}>
          Main bhi try karta hoon →
        </a>
      </aside>
      <section className="card chat-panel">
        <div className="chat-scroll">
          <Chat level={level} messages={game.messages} typing={false} animateFrom={Infinity} />
        </div>
      </section>
    </div>
  );
}
