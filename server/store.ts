import fs from 'node:fs';
import path from 'node:path';
import type { LeaderboardEntry, RunRecord, RunSummary } from '../shared/types.ts';

/**
 * Tiny JSON-file store. One file per run plus a leaderboard file.
 * On Azure App Service, DATA_DIR=/home/data survives restarts and redeploys.
 */
export class Store {
  private runsDir: string;
  private boardFile: string;
  private board: LeaderboardEntry[] = [];
  private index: RunSummary[] = [];

  constructor(private dir: string, private maxRuns: number) {
    this.runsDir = path.join(dir, 'runs');
    this.boardFile = path.join(dir, 'leaderboard.json');
    fs.mkdirSync(this.runsDir, { recursive: true });
    try {
      this.board = JSON.parse(fs.readFileSync(this.boardFile, 'utf8'));
    } catch {
      this.board = [];
    }
    this.index = fs
      .readdirSync(this.runsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const r = JSON.parse(fs.readFileSync(path.join(this.runsDir, f), 'utf8')) as RunRecord;
          return summarize(r);
        } catch {
          return null;
        }
      })
      .filter((x): x is RunSummary => !!x)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private writeAtomic(file: string, data: string) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  }

  private runFile(id: string) {
    if (!/^[a-zA-Z0-9_-]{6,64}$/.test(id)) throw new Error('bad run id');
    return path.join(this.runsDir, `${id}.json`);
  }

  saveRun(run: RunRecord) {
    this.writeAtomic(this.runFile(run.id), JSON.stringify(run));
    this.index = this.index.filter((r) => r.id !== run.id);
    this.index.push(summarize(run));
    this.prune();
  }

  getRun(id: string): RunRecord | null {
    try {
      return JSON.parse(fs.readFileSync(this.runFile(id), 'utf8'));
    } catch {
      return null;
    }
  }

  private prune() {
    const keep = new Set(this.board.map((b) => b.runId));
    while (this.index.length > this.maxRuns) {
      const victim = this.index.find((r) => !keep.has(r.id));
      if (!victim) break;
      this.index = this.index.filter((r) => r.id !== victim.id);
      try {
        fs.unlinkSync(this.runFile(victim.id));
      } catch {
        /* already gone */
      }
    }
  }

  addToLeaderboard(entry: LeaderboardEntry) {
    this.board = this.board.filter((b) => b.runId !== entry.runId);
    this.board.push(entry);
    // keep the board bounded: best 200 per scenario+mode
    const groups = new Map<string, LeaderboardEntry[]>();
    for (const b of this.board) {
      const k = `${b.scenarioId}|${b.mode}`;
      groups.set(k, [...(groups.get(k) ?? []), b]);
    }
    this.board = [...groups.values()].flatMap((g) => g.sort(byScore).slice(0, 200));
    this.writeAtomic(this.boardFile, JSON.stringify(this.board));
  }

  leaderboard(filter: { scenarioId?: string; mode?: 'llm' | 'sim'; day?: string | null }): LeaderboardEntry[] {
    return this.board
      .filter((b) => (!filter.scenarioId || b.scenarioId === filter.scenarioId) && (!filter.mode || b.mode === filter.mode) && (!filter.day || b.day === filter.day))
      .sort(byScore)
      .slice(0, 50);
  }

  recent(limit = 20): RunSummary[] {
    return this.index.filter((r) => r.status === 'done').slice(-limit).reverse();
  }
}

function byScore(a: LeaderboardEntry, b: LeaderboardEntry) {
  return b.score - a.score || a.createdAt.localeCompare(b.createdAt);
}

export function summarize(r: RunRecord): RunSummary {
  return {
    id: r.id,
    createdAt: r.createdAt,
    scenarioId: r.scenarioId,
    scenarioTitle: r.scenarioTitle,
    mode: r.mode,
    model: r.model,
    handle: r.handle,
    score: r.score,
    grade: r.grade,
    seedMode: r.seedMode,
    day: r.day,
    status: r.status,
  };
}
