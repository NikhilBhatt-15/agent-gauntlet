import { parseRupees, rupees } from './format.ts';
import type { KeeperAgent, KeeperReply, KeeperTurn } from './game.ts';
import type { GameState, Level } from './types.ts';

/** Round to amounts a shopkeeper would actually say. */
export function roundingStep(n: number): number {
  return n < 1000 ? 10 : n < 10000 ? 50 : n < 100000 ? 500 : 5000;
}

export function niceRound(n: number): number {
  const step = roundingStep(n);
  return Math.round(n / step) * step;
}

const pick = <T>(arr: T[], seed: number) => arr[Math.abs(seed) % arr.length];

const LINES = {
  counter: [
    'Chalo {price} kar deta hoon, isse kam mushkil hai.',
    'Aap bhi kya yaad karoge, {price} final... almost final!',
    '{price} lagao, bas. Isme bhi mera kuch nahi bachta.',
  ],
  lowball: ['Itne mein? Mazaak mat karo! {price} se kam nahi hoga.', 'Arre itna kam? Cost bhi nahi nikalega. {price} dekh lo.'],
  hold: ['Price toh {price} hi hai. Aap batao, kitna doge?', 'Seedha number bolo na, {price} se aage baat karte hain.'],
  accept: ['Chalo theek hai, {price} mein deal pakki! 🤝', 'Aapke liye {price}, done! Haath milao!'],
  callback: ['Arre ruko ruko! Chalo {price}, ab toh maan jao!', 'Kahan chal diye? {price} last, sirf aapke liye!'],
  letGo: ['Theek hai, jaiye. Aisa maal aur kahin nahi milega!', 'Koi baat nahi, phir kabhi aana.'],
  tired: ['Bas, ab bahut ho gaya. {price} lena hai toh lo.'],
};

/** Keyword stand-in for the AI's "how convincing was that" judgement. */
export function argumentStrength(lower: string): 0 | 1 | 2 | 3 {
  let s = 0;
  if (/online|amazon|flipkart|olx|bagal|next shop|doosr|dusr|sasta|other shop/.test(lower)) s++;
  if (/bulk|daily|roz|regular|cash|advance|turant|abhi|immediately|lamba|long|saal|year/.test(lower)) s++;
  if (/scratch|battery|tyre|insurance|loose|defect|purana|bill nahi|no bill|maintenance|thread/.test(lower)) s++;
  if (/jaa raha|ja raha|chalta|bye|nahi chahiye|rehne do/.test(lower)) s = Math.max(s, 1);
  return Math.min(3, s) as 0 | 1 | 2 | 3;
}

/**
 * Rule-based shopkeeper used when no LLM is available. Hinglish templates, number parsing,
 * and the same per-turn limit the AI gets. It never goes below that limit, so jugaad needs a real AI.
 */
export class OfflineKeeper implements KeeperAgent {
  readonly mode = 'offline' as const;
  readonly model = 'offline script';

  async turn({ level, state, text, event }: KeeperTurn): Promise<KeeperReply> {
    return offlineReply(level, state, text, event);
  }
}

export function offlineReply(level: Level, state: Pick<GameState, 'ask' | 'patience' | 'limit' | 'messages'>, text: string, event: 'say' | 'walk'): KeeperReply {
  const { ask, patience } = state;
  const seed = state.messages.length;
  const L = Math.min(ask, state.limit ?? level.floorPrice);
  const k = level.keeper;
  const say = (key: keyof typeof LINES, price: number) => {
    const line = pick(LINES[key], seed).replace('{price}', rupees(price));
    return seed % 3 === 0 ? `${pick(k.catchphrases, seed)} ${line}` : line;
  };
  const reply = (key: keyof typeof LINES, price: number, extra: Partial<KeeperReply> = {}): KeeperReply => ({
    reply: say(key, price),
    price: Math.min(Math.max(price, L), ask),
    accept: false,
    mood: 'neutral',
    strength: 0,
    weakSpot: false,
    end: false,
    ...extra,
  });
  // share of the gap to the limit given up in one reply (later levels are stingier)
  const step = [0.6, 0.5, 0.45, 0.4, 0.35][level.order - 1] ?? 0.4;

  if (event === 'walk') {
    if (ask <= L) return reply('letGo', ask, { end: true });
    return reply('callback', niceRound(ask - (ask - L) * 0.6));
  }

  const offer = parseRupees(text);
  const lower = text.toLowerCase();
  if (offer !== null && offer > 0 && offer < ask * 3) {
    if (offer >= ask) return reply('accept', ask, { accept: true, mood: 'happy' });
    if (offer >= L && offer >= ask - (ask - L) * 0.3) return { ...reply('accept', offer, { accept: true, mood: 'happy', strength: 1 }), price: offer };
    const lowball = offer < level.floorPrice * 0.75;
    const target = niceRound(ask - (ask - Math.max(offer, L)) * (lowball ? step / 2 : step));
    return reply(patience <= 1 ? 'tired' : lowball ? 'lowball' : 'counter', target, { mood: lowball ? 'annoyed' : 'neutral', strength: lowball ? 0 : argumentStrength(lower) || 1 });
  }

  const strength = argumentStrength(lower);
  if (!strength) return reply('hold', ask);
  return reply('counter', niceRound(ask - (ask - L) * step), { strength });
}
