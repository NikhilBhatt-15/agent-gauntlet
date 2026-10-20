import { parseRupees, rupees } from './format.ts';
import { niceRound, offlineReply, roundingStep } from './offline.ts';
import { computeResult } from './scoring.ts';
import type { Bill, GameState, Level, Message, Mood } from './types.ts';

export interface KeeperTurn {
  level: Level;
  state: GameState;
  text: string;
  event: 'say' | 'walk';
}

export interface KeeperReply {
  reply: string;
  price: number;
  accept: boolean;
  mood: Mood;
  /** how convincing the customer's last message was, 0–3 (drives the concession ladder) */
  strength: 0 | 1 | 2 | 3;
  /** the customer's message genuinely hit the shopkeeper's designed weak spot */
  weakSpot: boolean;
  end: boolean;
}

export interface KeeperAgent {
  mode: 'llm' | 'offline';
  model: string;
  turn(t: KeeperTurn): Promise<KeeperReply>;
}

export interface MunimAgent {
  review(level: Level, state: GameState, price: number): Promise<{ approve: boolean; say: string }>;
}

export interface JudgeAgent {
  judge(level: Level, state: GameState): Promise<{ tactics: string[]; bestLine: string | null; comment: string | null }>;
}

export interface BillSigner {
  sign(bill: Bill): { signature: string; kid: string };
}

export interface Agents {
  keeper: KeeperAgent;
  munim: MunimAgent;
  judge: JudgeAgent;
  signer: BillSigner;
}

export class GameError extends Error {}

const MOODS: Mood[] = ['happy', 'neutral', 'annoyed', 'angry', 'impressed', 'suspicious'];

// How far below the minimum a found weak spot can take the limit (share of minimum→cost), per level.
const WEAK_DEPTH = [0.7, 0.6, 0.4, 0.35, 0];

/** A weak-spot hit: the shopkeeper is carried away, so his limit drops below his real minimum. */
export function weakSpotLimit(level: Level, limit: number, hits: number): number {
  const depth = Math.min(1, (WEAK_DEPTH[level.order - 1] ?? 0) * (0.6 + 0.4 * hits));
  const target = niceRound(level.floorPrice - (level.floorPrice - level.costPrice) * depth);
  return Math.max(level.costPrice, Math.min(limit, target));
}

/** Where the per-turn limit starts: just under the asking price. */
export function initialLimit(level: Level): number {
  return Math.max(level.floorPrice, niceRound(level.askingPrice - (level.askingPrice - level.floorPrice) * 0.15));
}

// Later shopkeepers give ground more slowly.
const STINGINESS = [1, 0.9, 0.8, 0.7, 0.6];

/**
 * The concession ladder. Code, not the AI, decides how far the shopkeeper may go each turn:
 * good arguments bring the limit down toward the secret minimum, chit-chat barely moves it.
 */
export function nextLimit(level: Level, limit: number, strength: number, patience: number): number {
  const stingy = STINGINESS[level.order - 1] ?? 0.6;
  const rate = ([0.05, 0.2, 0.35, 0.5][strength] ?? 0.05) * stingy + (patience <= 2 ? 0.08 : 0);
  // proportional part (big moves early) + linear part (so it actually arrives)
  const linear = (level.askingPrice - level.floorPrice) * 0.03 * strength * stingy;
  let next = niceRound(limit - (limit - level.floorPrice) * rate - linear);
  // rounding must not swallow a real concession near the bottom
  if (next >= limit && strength > 0) next = limit - roundingStep(limit);
  return Math.min(Math.max(level.floorPrice, next), limit);
}

export function newGame(level: Level, id: string, keeper: KeeperAgent, now = Date.now()): GameState {
  return {
    id,
    levelId: level.id,
    status: 'open',
    mode: keeper.mode,
    model: keeper.model,
    patience: level.patience,
    maxPatience: level.patience,
    ask: level.askingPrice,
    limit: initialLimit(level),
    weakSpotHits: 0,
    lastOffer: null,
    messages: [{ from: 'keeper', text: level.intro, price: level.askingPrice, mood: 'happy', t: now }],
    result: null,
    createdAt: new Date(now).toISOString(),
    handle: null,
  };
}

/** Make whatever the model returned safe for the engine. */
export function sanitizeReply(raw: Partial<KeeperReply> | null | undefined, ask: number): KeeperReply {
  const price = typeof raw?.price === 'number' && Number.isFinite(raw.price) && raw.price > 0 ? Math.round(raw.price) : ask;
  return {
    reply: String(raw?.reply ?? '').trim().slice(0, 500) || '...',
    // a shopkeeper never raises his asking price
    price: Math.min(price, ask),
    accept: raw?.accept === true,
    mood: MOODS.includes(raw?.mood as Mood) ? (raw!.mood as Mood) : 'neutral',
    // a missing rating counts as "weak", not "nothing"
    strength: ([0, 1, 2, 3] as const).find((n) => n === Math.round(Number(raw?.strength))) ?? 1,
    weakSpot: raw?.weakSpot === true,
    end: raw?.end === true,
  };
}

async function keeperTurn(agents: Agents, t: KeeperTurn): Promise<KeeperReply> {
  try {
    return sanitizeReply(await agents.keeper.turn(t), t.state.ask);
  } catch {
    // provider trouble mid-game: the scripted shopkeeper covers this one turn
    return sanitizeReply(offlineReply(t.level, t.state, t.text, t.event), t.state.ask);
  }
}

function push(state: GameState, m: Omit<Message, 't'>) {
  state.messages.push({ ...m, t: Date.now() });
}

function applyMood(state: GameState, mood: Mood) {
  if (mood === 'angry') state.patience = Math.max(0, state.patience - 1);
  if (mood === 'impressed') state.patience = Math.min(state.maxPatience, state.patience + 1);
}

export function canSpeak(state: GameState): boolean {
  return state.status === 'open' && state.patience > 0;
}

export async function playerSays(state: GameState, level: Level, text: string, agents: Agents): Promise<void> {
  if (state.status !== 'open') throw new GameError('This game is over.');
  if (state.patience <= 0) throw new GameError(`${level.keeper.name} has no patience left. Accept his price or walk away.`);
  const clean = text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!clean) throw new GameError('Say something!');
  const offer = parseRupees(clean);
  push(state, { from: 'player', text: clean, ...(offer !== null ? { offer } : {}) });
  if (offer !== null) state.lastOffer = offer;
  state.patience -= 1;

  const r = await keeperTurn(agents, { level, state, text: clean, event: 'say' });
  applyMood(state, r.mood);
  push(state, { from: 'keeper', text: r.reply, price: r.price, mood: r.mood });
  state.ask = r.price;
  state.limit = Math.min(nextLimit(level, state.limit ?? state.ask, r.strength, state.patience), state.ask);
  if (r.weakSpot && level.keeper.weakness) {
    state.weakSpotHits += 1;
    state.limit = weakSpotLimit(level, state.limit, state.weakSpotHits);
    const pr = level.keeper.pronoun === 'she' ? 'She' : 'He';
    if (state.weakSpotHits === 1) push(state, { from: 'system', kind: 'weak', text: `You found ${level.keeper.name}'s weak spot! ${pr} is getting carried away — strike now with a low offer.` });
  }

  if (r.accept) return closeDeal(state, level, r.price, agents);
  if (r.end) return finish(state, level, 'refused', null, false, agents);
  if (state.patience <= 0) push(state, { from: 'system', kind: 'patience', text: `${level.keeper.name}'s patience is over. Take the last price of ${rupees(state.ask)}, or walk away.` });
}

export async function playerAccepts(state: GameState, level: Level, agents: Agents): Promise<void> {
  if (state.status !== 'open') throw new GameError('This game is over.');
  push(state, { from: 'player', text: `Deal! ${rupees(state.ask)}`, offer: state.ask });
  return closeDeal(state, level, state.ask, agents);
}

export async function playerWalks(state: GameState, level: Level, agents: Agents): Promise<void> {
  if (state.status !== 'open') throw new GameError('This game is over.');
  push(state, { from: 'player', text: 'Rehne do, main chalta hoon.' });
  const before = state.ask;
  // a customer at the door is the strongest argument there is
  const lim = state.limit ?? state.ask;
  state.limit = Math.min(lim, Math.max(level.floorPrice, niceRound(lim - (lim - level.floorPrice) * 0.5)));
  const r = await keeperTurn(agents, { level, state, text: '*walks away*', event: 'walk' });
  state.patience = Math.max(0, state.patience - 1);
  push(state, { from: 'keeper', text: r.reply, price: r.price, mood: r.mood });
  state.ask = r.price;
  // a call-back must come with a better price; otherwise the customer is gone
  if (r.end || r.price >= before) return finish(state, level, 'walked', null, false, agents);
  if (state.patience <= 0) push(state, { from: 'system', kind: 'patience', text: `Last chance: ${rupees(state.ask)}. Accept or walk away.` });
}

async function closeDeal(state: GameState, level: Level, price: number, agents: Agents): Promise<void> {
  let munimFooled = false;
  if (level.munim && price < level.floorPrice) {
    push(state, { from: 'system', kind: 'munim-check', text: 'Munim ji is checking the bill…' });
    let verdict: { approve: boolean; say: string };
    try {
      verdict = await agents.munim.review(level, state, price);
    } catch {
      verdict = { approve: false, say: 'Ye bill nahi banega. Minimum se neeche? Bilkul nahi!' };
    }
    push(state, { from: 'munim', text: verdict.say || (verdict.approve ? 'Theek hai, bill bana do.' : 'Nahi! Ye bill cancel.') });
    if (!verdict.approve) {
      // the keeper goes back to a price just above his minimum
      state.ask = Math.max(state.limit ?? level.floorPrice, niceRound(level.floorPrice * 1.02));
      state.limit = Math.min(state.limit ?? state.ask, state.ask);
      push(state, { from: 'keeper', text: `Sorry, Munim ji ne mana kar diya. Best main ${rupees(state.ask)} kar sakta hoon.`, price: state.ask, mood: 'neutral' });
      return;
    }
    munimFooled = true;
  }
  return finish(state, level, 'deal', price, munimFooled, agents);
}

async function finish(state: GameState, level: Level, status: GameState['status'], price: number | null, munimFooled: boolean, agents: Agents): Promise<void> {
  state.status = status;
  let extras: { tactics: string[]; bestLine: string | null; comment: string | null } = { tactics: [], bestLine: null, comment: null };
  if (state.messages.some((m) => m.from === 'player')) {
    try {
      extras = await agents.judge.judge(level, state);
    } catch {
      /* no recap */
    }
  }
  const result = computeResult(level, state, price, munimFooled, extras);
  result.weakSpotFound = state.weakSpotHits > 0;
  if (price !== null) {
    const bill: Bill = {
      version: 1,
      billNo: `MB-${state.id.slice(0, 8).toUpperCase()}`,
      gameId: state.id,
      shop: level.keeper.shop,
      keeper: level.keeper.name,
      item: level.item.name,
      askingPrice: level.askingPrice,
      price,
      saved: result.saved,
      date: new Date().toISOString(),
    };
    const s = agents.signer.sign(bill);
    Object.assign(result, { bill, signature: s.signature, kid: s.kid });
  }
  state.result = result;
}
