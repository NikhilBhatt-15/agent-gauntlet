import crypto from 'node:crypto';
import { GameError, newGame, playerAccepts, playerSays, playerWalks, type Agents, type JudgeAgent, type KeeperAgent, type MunimAgent } from '../shared/game.ts';
import { getLevel } from '../shared/levels.ts';
import type { GameState, LeaderboardEntry } from '../shared/types.ts';
import type { Escrow } from './escrow.ts';
import type { StoredGame, Store } from './store.ts';

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export interface AgentFactory {
  /** null when no LLM can be used right now */
  llm(): { keeper: KeeperAgent; munim: MunimAgent; judge: JudgeAgent } | null;
  offline(): { keeper: KeeperAgent; munim: MunimAgent; judge: JudgeAgent };
}

/** Public view: no token hash, no secret prices while the game is open. */
export function publicState(g: StoredGame): GameState {
  const { tokenHash: _t, publish: _p, limit: _l, ...rest } = g;
  return rest;
}

export class GameManager {
  private live = new Map<string, StoredGame>();
  /** serialise actions per game so double-clicks can't race */
  private locks = new Map<string, Promise<unknown>>();

  constructor(
    private store: Store,
    private escrow: Escrow,
    private factory: AgentFactory,
  ) {}

  private agentsFor(g: GameState): Agents {
    const set = g.mode === 'llm' ? (this.factory.llm() ?? this.factory.offline()) : this.factory.offline();
    return { ...set, signer: { sign: (bill) => ({ signature: this.escrow.signBill(bill), kid: this.escrow.kid }) } };
  }

  create(levelId: string, preferLlm: boolean): { game: StoredGame; token: string } {
    const level = getLevel(levelId);
    if (!level) throw new GameError('Unknown level');
    const set = (preferLlm && this.factory.llm()) || this.factory.offline();
    const id = crypto.randomBytes(9).toString('base64url');
    const token = crypto.randomBytes(18).toString('base64url');
    const game: StoredGame = { ...newGame(level, id, set.keeper), tokenHash: sha(token), publish: false };
    this.live.set(id, game);
    this.store.saveGame(game);
    return { game, token };
  }

  get(id: string): StoredGame | null {
    return this.live.get(id) ?? this.store.getGame(id);
  }

  private async act(id: string, token: string, fn: (g: StoredGame, agents: Agents) => Promise<void>): Promise<StoredGame> {
    const g = this.get(id);
    if (!g) throw new GameError('Game not found');
    if (sha(token) !== g.tokenHash) throw new GameError('This is not your game');
    const prev = this.locks.get(id) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(async () => {
      await fn(g, this.agentsFor(g));
      this.store.saveGame(g);
      if (g.status !== 'open') this.live.delete(id);
      else this.live.set(id, g);
      return g;
    });
    this.locks.set(id, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(id) === run) this.locks.delete(id);
    }
  }

  say(id: string, token: string, text: string) {
    return this.act(id, token, (g, a) => playerSays(g, getLevel(g.levelId)!, text, a));
  }

  accept(id: string, token: string) {
    return this.act(id, token, (g, a) => playerAccepts(g, getLevel(g.levelId)!, a));
  }

  walk(id: string, token: string) {
    return this.act(id, token, (g, a) => playerWalks(g, getLevel(g.levelId)!, a));
  }

  claim(id: string, token: string, handle: string, publish: boolean): LeaderboardEntry {
    const g = this.get(id);
    if (!g) throw new GameError('Game not found');
    if (sha(token) !== g.tokenHash) throw new GameError('This is not your game');
    if (g.status !== 'deal' || !g.result || g.result.price === null) throw new GameError('Only finished deals can go on the leaderboard');
    if (g.handle) throw new GameError('Already on the leaderboard');
    if (g.mode !== 'llm') throw new GameError('Offline games are practice only — play against the AI to get ranked');
    g.handle = handle;
    g.publish = publish;
    const entry: LeaderboardEntry = {
      gameId: g.id,
      handle,
      levelId: g.levelId,
      score: g.result.score,
      stars: g.result.stars,
      price: g.result.price,
      jugaad: g.result.jugaad,
      bestLine: publish ? g.result.bestLine : null,
      tactics: g.result.tactics,
      messagesUsed: g.result.messagesUsed,
      createdAt: g.createdAt,
    };
    this.store.saveGame(g);
    this.store.addToLeaderboard(entry);
    return entry;
  }

  /** Finished games can be viewed by anyone (share links); open games only by their player. */
  view(id: string, token?: string): GameState | null {
    const g = this.get(id);
    if (!g) return null;
    if (g.status === 'open' && (!token || sha(token) !== g.tokenHash)) return null;
    return publicState(g);
  }
}

