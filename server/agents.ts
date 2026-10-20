import type { JudgeAgent, KeeperAgent, KeeperReply, KeeperTurn, MunimAgent } from '../shared/game.ts';
import { judgeMessages, keeperMessages, munimMessages, TACTICS, type ChatMessage } from '../shared/prompts.ts';
import type { GameState, Level } from '../shared/types.ts';
import { extractJson, modelsFor, type ProviderChain } from './llm/client.ts';

/** Ask for JSON; one repair retry if the reply doesn't parse. */
async function askJson<T>(chain: ProviderChain, messages: ChatMessage[], tier: 'buyer' | 'voice', check: (x: unknown) => x is T, maxTokens: number): Promise<{ value: T; model: string }> {
  let msgs = messages;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, model } = await chain.chat(msgs, { tier, json: true, temperature: tier === 'buyer' ? 0.8 : 0.4, maxTokens });
    try {
      const v = extractJson(text);
      if (check(v)) return { value: v, model };
      lastErr = new Error('reply missing required fields');
    } catch (e) {
      lastErr = e;
    }
    msgs = [...messages, { role: 'assistant', content: text.slice(0, 1500) }, { role: 'user', content: 'Reply again with ONLY the JSON object in the required format.' }];
  }
  throw lastErr;
}

const isKeeperReply = (x: unknown): x is Partial<KeeperReply> => !!x && typeof x === 'object' && typeof (x as KeeperReply).reply === 'string';

/** The shopkeeper. Uses the strong ("buyer") tier: it has to stay in character AND hold its rule. */
export class LlmKeeper implements KeeperAgent {
  readonly mode = 'llm' as const;
  model: string;

  constructor(private chain: ProviderChain) {
    const p = chain.providers[0];
    this.model = p ? modelsFor(p, 'buyer')[0] : 'unknown';
  }

  async turn({ level, state, event }: KeeperTurn): Promise<KeeperReply> {
    const { value, model } = await askJson(this.chain, keeperMessages(level, state, event), 'buyer', isKeeperReply, 700);
    this.model = model;
    // price may come back as a string like "₹4,85,000"
    const raw = value as Record<string, unknown>;
    const price = typeof raw.price === 'string' ? Number(String(raw.price).replace(/[^\d.]/g, '')) : raw.price;
    return {
      ...(value as KeeperReply),
      price: price as number,
      strength: Number(raw.strength) as KeeperReply['strength'],
      weakSpot: raw.weakSpot === true || raw.weak_spot === true,
      argument: String(raw.argument ?? 'other').toLowerCase(),
    };
  }
}

export class LlmMunim implements MunimAgent {
  constructor(private chain: ProviderChain) {}

  async review(level: Level, state: GameState, price: number) {
    const ok = (x: unknown): x is { approve: boolean; say: string } => !!x && typeof x === 'object' && typeof (x as { approve: unknown }).approve === 'boolean';
    const { value } = await askJson(this.chain, munimMessages(level, state, price), 'buyer', ok, 300);
    return { approve: value.approve, say: String(value.say ?? '').slice(0, 300) };
  }
}

export class LlmJudge implements JudgeAgent {
  constructor(private chain: ProviderChain) {}

  async judge(level: Level, state: GameState) {
    const ok = (x: unknown): x is { tactics: unknown[]; bestLine?: unknown; comment?: unknown } => !!x && typeof x === 'object' && Array.isArray((x as { tactics: unknown }).tactics);
    try {
      const { value } = await askJson(this.chain, judgeMessages(level, state), 'voice', ok, 400);
      const playerLines = state.messages.filter((m) => m.from === 'player').map((m) => m.text);
      const best = typeof value.bestLine === 'string' ? value.bestLine.trim() : '';
      return {
        tactics: value.tactics.map(String).filter((t) => (TACTICS as readonly string[]).includes(t)).slice(0, 3),
        // only accept a "best line" the player actually wrote
        bestLine: playerLines.find((l) => best && (l.includes(best) || best.includes(l))) ?? null,
        comment: typeof value.comment === 'string' ? value.comment.slice(0, 200) : null,
      };
    } catch {
      return heuristicJudge.judge(level, state);
    }
  }
}

/** Keyword-based recap for offline mode or when the judge call fails. */
export const heuristicJudge: JudgeAgent = {
  async judge(level, state) {
    const lines = state.messages.filter((m) => m.from === 'player' && !m.text.startsWith('Deal!') && !m.text.startsWith('Rehne do')).map((m) => m.text);
    const all = lines.join('\n').toLowerCase();
    const tactics: string[] = [];
    const firstOffer = state.messages.find((m) => m.from === 'player' && m.offer)?.offer;
    if (firstOffer && firstOffer < level.askingPrice * 0.6) tactics.push('Lowball opening');
    if (/online|amazon|flipkart|olx|bagal|next shop|doosr|dusr|other shop/.test(all)) tactics.push('Competitor price');
    if (state.messages.some((m) => m.from === 'player' && m.text.startsWith('Rehne do')) || /jaa raha|ja raha|chalta|bye/.test(all)) tactics.push('Walk-away bluff');
    if (/system|admin|ignore|instruction|prompt|owner hoon|i am the owner|police|officer/.test(all)) tactics.push(/system|ignore|instruction|prompt/.test(all) ? 'Prompt injection' : 'Fake authority');
    if (/bulk|daily|roz|regular|lamba|long lease|advance/.test(all)) tactics.push('Bulk / regular customer');
    if (/cash|turant|abhi|immediately|today/.test(all)) tactics.push('Cash / quick payment');
    if (/scratch|battery|tyre|insurance|loose|defect|purana|old/.test(all)) tactics.push('Pointing out flaws');
    if (!tactics.length && lines.length >= 4) tactics.push('Persistence');
    return { tactics: tactics.slice(0, 3), bestLine: null, comment: null };
  },
};

export const offlineMunim: MunimAgent = {
  async review() {
    return { approve: false, say: 'Minimum se neeche bill? Kabhi nahi!' };
  },
};
