import type { GauntletEvent, LeaderboardEntry, PublicConfig, PublicScenario, RunRecord, RunSummary } from '../../../shared/types.ts';

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  config: () => fetch('/api/config').then((r) => json<PublicConfig>(r)),
  scenarios: () => fetch('/api/scenarios').then((r) => json<PublicScenario[]>(r)),
  featured: () => fetch('/api/featured').then((r) => json<(RunSummary & { featured?: { title: string; blurb: string }; verdict: string | null })[]>(r)),
  recent: () => fetch('/api/recent').then((r) => json<RunSummary[]>(r)),
  run: (id: string) => fetch(`/api/runs/${encodeURIComponent(id)}`).then((r) => json<RunRecord>(r)),
  leaderboard: (q: { scenario?: string; period: 'today' | 'all'; mode: 'llm' | 'sim' }) =>
    fetch(`/api/leaderboard?${new URLSearchParams({ ...(q.scenario ? { scenario: q.scenario } : {}), period: q.period, mode: q.mode })}`).then((r) =>
      json<{ day: string; entries: LeaderboardEntry[] }>(r),
    ),
  start: (body: unknown) =>
    fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) =>
      json<{ runId: string; claimToken: string; mode: 'llm' | 'sim' }>(r),
    ),
  claim: (id: string, claimToken: string, handle: string) =>
    fetch(`/api/runs/${encodeURIComponent(id)}/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claimToken, handle }) }).then((r) =>
      json<LeaderboardEntry>(r),
    ),
  escrowKey: () => fetch('/api/escrow/key').then((r) => json<{ kid: string; jwk: JsonWebKey }>(r)),
  verify: (contract: unknown, signature: string) =>
    fetch('/api/escrow/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contract, signature }) }).then((r) =>
      json<{ valid: boolean }>(r),
    ),
};

/** Streams a run's events over SSE. Closes itself after run.finished. */
export function streamRun(id: string, onEvent: (e: GauntletEvent) => void, onError: (msg: string) => void): () => void {
  const es = new EventSource(`/api/runs/${encodeURIComponent(id)}/events`);
  let finished = false;
  let failures = 0;
  es.addEventListener('gauntlet', (m) => {
    failures = 0;
    const e = JSON.parse((m as MessageEvent).data) as GauntletEvent;
    onEvent(e);
    if (e.type === 'run.finished') {
      finished = true;
      es.close();
    }
  });
  es.onerror = () => {
    if (finished) return;
    // EventSource reconnects by itself (resuming via Last-Event-ID); give up after a few tries.
    if (++failures > 4 || es.readyState === EventSource.CLOSED) {
      es.close();
      onError('Lost connection to the arena.');
    }
  };
  return () => es.close();
}

// claim tokens live in localStorage so a refresh can still submit to the leaderboard
const TOKENS = 'gauntlet.claims';
export function saveClaimToken(runId: string, token: string) {
  try {
    const all = JSON.parse(localStorage.getItem(TOKENS) || '{}');
    all[runId] = token;
    localStorage.setItem(TOKENS, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}
export function getClaimToken(runId: string): string | null {
  try {
    return JSON.parse(localStorage.getItem(TOKENS) || '{}')[runId] ?? null;
  } catch {
    return null;
  }
}

export function store<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
export function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}
