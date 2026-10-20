import type { GameState, LeaderboardEntry, PublicConfig, PublicLevel } from '../../../shared/types.ts';

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  return body as T;
}
const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
  config: () => fetch('/api/config').then((r) => json<PublicConfig>(r)),
  levels: () => fetch('/api/levels').then((r) => json<PublicLevel[]>(r)),
  start: (levelId: string) => post('/api/games', { levelId }).then((r) => json<{ token: string; state: GameState }>(r)),
  say: (id: string, token: string, text: string) => post(`/api/games/${id}/say`, { token, text }).then((r) => json<{ state: GameState }>(r)),
  accept: (id: string, token: string) => post(`/api/games/${id}/accept`, { token }).then((r) => json<{ state: GameState }>(r)),
  walk: (id: string, token: string) => post(`/api/games/${id}/walk`, { token }).then((r) => json<{ state: GameState }>(r)),
  game: (id: string, token?: string) => fetch(`/api/games/${id}${token ? `?token=${encodeURIComponent(token)}` : ''}`).then((r) => json<GameState>(r)),
  claim: (id: string, token: string, handle: string, publish: boolean) => post(`/api/games/${id}/claim`, { token, handle, publish }).then((r) => json<LeaderboardEntry>(r)),
  leaderboard: (level?: string) => fetch(`/api/leaderboard${level ? `?level=${level}` : ''}`).then((r) => json<{ top: LeaderboardEntry[]; jugaad: LeaderboardEntry[] }>(r)),
  escrowKey: () => fetch('/api/escrow/key').then((r) => json<{ kid: string; jwk: JsonWebKey }>(r)),
  verify: (bill: unknown, signature: string) => post('/api/escrow/verify', { bill, signature }).then((r) => json<{ valid: boolean }>(r)),
};

// ---- local, per-browser conveniences (progress, tokens, name) ----
function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) — the game still works */
  }
}

export interface Progress {
  [levelId: string]: { best: number; stars: number; jugaad: boolean };
}
export const progress = {
  get: () => read<Progress>('molbhav.progress', {}),
  record(levelId: string, score: number, stars: number, jugaad: boolean) {
    const p = progress.get();
    const prev = p[levelId];
    p[levelId] = { best: Math.max(prev?.best ?? 0, score), stars: Math.max(prev?.stars ?? 0, stars), jugaad: (prev?.jugaad ?? false) || jugaad };
    write('molbhav.progress', p);
  },
};
export const tokens = {
  get: (gameId: string) => read<Record<string, string>>('molbhav.tokens', {})[gameId] ?? null,
  set(gameId: string, token: string) {
    const all = read<Record<string, string>>('molbhav.tokens', {});
    all[gameId] = token;
    write('molbhav.tokens', all);
  },
};
export const savedName = { get: () => read<string>('molbhav.name', ''), set: (n: string) => write('molbhav.name', n) };
