import fs from 'node:fs';
import path from 'node:path';
import type { GameState, LeaderboardEntry } from '../shared/types.ts';

export interface StoredGame extends GameState {
  tokenHash: string;
  publish: boolean;
}

/**
 * Tiny JSON-file store: one file per game plus a leaderboard file.
 * On Azure App Service, DATA_DIR=/home/data survives restarts and redeploys.
 */
export class Store {
  private gamesDir: string;
  private boardFile: string;
  private board: LeaderboardEntry[] = [];
  private index: { id: string; createdAt: string }[] = [];

  constructor(dir: string, private maxGames: number) {
    this.gamesDir = path.join(dir, 'games');
    this.boardFile = path.join(dir, 'leaderboard.json');
    fs.mkdirSync(this.gamesDir, { recursive: true });
    try {
      this.board = JSON.parse(fs.readFileSync(this.boardFile, 'utf8'));
    } catch {
      this.board = [];
    }
    this.index = fs
      .readdirSync(this.gamesDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({ id: f.slice(0, -5), createdAt: fs.statSync(path.join(this.gamesDir, f)).mtime.toISOString() }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private writeAtomic(file: string, data: string) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  }

  private file(id: string) {
    if (!/^[a-zA-Z0-9_-]{6,64}$/.test(id)) throw new Error('bad id');
    return path.join(this.gamesDir, `${id}.json`);
  }

  saveGame(g: StoredGame) {
    this.writeAtomic(this.file(g.id), JSON.stringify(g));
    if (!this.index.some((x) => x.id === g.id)) this.index.push({ id: g.id, createdAt: g.createdAt });
    this.prune();
  }

  getGame(id: string): StoredGame | null {
    try {
      return JSON.parse(fs.readFileSync(this.file(id), 'utf8'));
    } catch {
      return null;
    }
  }

  private prune() {
    const keep = new Set(this.board.map((b) => b.gameId));
    while (this.index.length > this.maxGames) {
      const victim = this.index.find((x) => !keep.has(x.id));
      if (!victim) break;
      this.index = this.index.filter((x) => x.id !== victim.id);
      try {
        fs.unlinkSync(this.file(victim.id));
      } catch {
        /* already gone */
      }
    }
  }

  addToLeaderboard(entry: LeaderboardEntry) {
    this.board = this.board.filter((b) => b.gameId !== entry.gameId);
    this.board.push(entry);
    const groups = new Map<string, LeaderboardEntry[]>();
    for (const b of this.board) groups.set(b.levelId, [...(groups.get(b.levelId) ?? []), b]);
    this.board = [...groups.values()].flatMap((g) => g.sort(byScore).slice(0, 200));
    this.writeAtomic(this.boardFile, JSON.stringify(this.board));
  }

  leaderboard(levelId?: string): { top: LeaderboardEntry[]; jugaad: LeaderboardEntry[] } {
    const rows = this.board.filter((b) => !levelId || b.levelId === levelId).sort(byScore);
    return { top: rows.slice(0, 50), jugaad: rows.filter((r) => r.jugaad).slice(0, 20) };
  }
}

function byScore(a: LeaderboardEntry, b: LeaderboardEntry) {
  return b.score - a.score || a.messagesUsed - b.messagesUsed || a.createdAt.localeCompare(b.createdAt);
}
