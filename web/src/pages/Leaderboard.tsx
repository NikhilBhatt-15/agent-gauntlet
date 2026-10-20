import { useEffect, useState } from 'react';
import { rupees } from '../../../shared/format.ts';
import type { LeaderboardEntry, PublicLevel } from '../../../shared/types.ts';
import { Stars } from '../components/Nav.tsx';
import { api } from '../lib/api.ts';
import { linkProps } from '../lib/router.ts';

export function LeaderboardPage() {
  const [levels, setLevels] = useState<PublicLevel[]>([]);
  const [level, setLevel] = useState('chai');
  const [data, setData] = useState<{ top: LeaderboardEntry[]; jugaad: LeaderboardEntry[] } | null>(null);

  useEffect(() => {
    api.levels().then(setLevels).catch(() => {});
  }, []);
  useEffect(() => {
    setData(null);
    api.leaderboard(level).then(setData).catch(() => setData({ top: [], jugaad: [] }));
  }, [level]);

  const lv = levels.find((l) => l.id === level);
  return (
    <div className="container" style={{ paddingTop: 28, paddingBottom: 48 }}>
      <span className="eyebrow">Leaderboard</span>
      <h1 className="h2">Mol-bhav ke badshah 👑</h1>
      <div className="seg" role="group" aria-label="Level" style={{ margin: '12px 0 16px' }}>
        {levels.map((l) => (
          <button key={l.id} aria-pressed={level === l.id} onClick={() => setLevel(l.id)}>
            {l.keeper.emoji} {l.keeper.name}
          </button>
        ))}
      </div>
      <div className="card" style={{ padding: 8, overflowX: 'auto' }}>
        {!data ? (
          <p style={{ padding: 16 }}>Loading…</p>
        ) : data.top.length === 0 ? (
          <p style={{ padding: 16 }}>
            Abhi tak koi nahi! <a {...linkProps(`/play/${level}`)}>Pehle aap →</a>
          </p>
        ) : (
          <table className="lb">
            <thead>
              <tr>
                <th>#</th>
                <th>Naam</th>
                <th>Price</th>
                <th>Score</th>
                <th>Msgs</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.top.map((e, i) => (
                <tr key={e.gameId}>
                  <td style={{ fontWeight: 800 }}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
                  <td style={{ fontWeight: 700 }}>
                    {e.handle} {e.jugaad && <span className="chip chip-red">JUGAAD</span>}
                  </td>
                  <td>
                    {rupees(e.price)}
                    {lv && <span className="muted" style={{ fontSize: 12 }}> / {rupees(lv.askingPrice)}</span>}
                  </td>
                  <td>
                    <b>{e.score}</b> <Stars n={e.stars} size={14} />
                  </td>
                  <td className="muted">{e.messagesUsed}</td>
                  <td>
                    <a className="btn btn-sm" {...linkProps(`/g/${e.gameId}`)}>
                      Chat dekho
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
