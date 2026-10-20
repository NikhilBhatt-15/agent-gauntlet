import { z } from 'zod';
import { buyerRoundPrompt, buyerSystemPrompt, contractPrompt, type BuyerAgent, type BuyerView, type ContractView } from '../shared/buyer.ts';
import { formatMoney } from '../shared/format.ts';
import type { BuyerDecision, BuyerInfo, ContractDecision } from '../shared/types.ts';
import { templateLine, type VoiceAgent, type VoiceContext, type VoiceItem } from '../shared/voice.ts';
import { extractJson, modelsFor, type ChatMessage, type ProviderChain } from './llm/client.ts';

const ActionSchema = z.object({
  vendor: z.string(),
  action: z.string().transform((s) => s.toLowerCase().trim()),
  price: z.union([z.number(), z.string()]).optional().nullable().transform((v) => {
    if (v === null || v === undefined) return undefined;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }),
  addons: z.array(z.string()).optional().nullable().transform((v) => v ?? undefined),
  message: z.string().optional().nullable().transform((v) => v ?? ''),
});

const DecisionSchema = z.object({
  thoughts: z.string().optional().default(''),
  actions: z.array(ActionSchema).default([]),
});

const ContractSchema = z.object({
  decision: z.string().transform((s) => (s.toLowerCase().includes('sign') && !s.toLowerCase().includes('refuse') ? 'sign' : 'refuse')),
  reason: z.string().optional().default(''),
});

type Usage = { calls: number; failures: number };

/** The visitor's agent. It only ever sees what `BuyerView` exposes. */
export class LlmBuyer implements BuyerAgent {
  info: BuyerInfo;
  readonly usage: Usage = { calls: 0, failures: 0 };

  constructor(
    private chain: ProviderChain,
    private signal?: AbortSignal,
  ) {
    const p = chain.providers[0];
    this.info = { mode: 'llm', model: p ? modelsFor(p, 'buyer')[0] : 'unknown', provider: p?.label ?? 'unknown' };
  }

  private async ask<T>(messages: ChatMessage[], schema: z.ZodType<T>): Promise<T> {
    let lastErr: unknown;
    let msgs = messages;
    for (let attempt = 0; attempt < 2; attempt++) {
      this.usage.calls++;
      try {
        const { text, provider, model } = await this.chain.chat(msgs, { tier: 'buyer', json: true, temperature: 0.4, maxTokens: 1200, signal: this.signal });
        this.info = { mode: 'llm', model, provider: provider.label };
        try {
          return schema.parse(extractJson(text));
        } catch (e) {
          lastErr = e;
          msgs = [...messages, { role: 'assistant', content: text.slice(0, 2000) }, { role: 'user', content: 'That was not valid. Reply with the JSON object only, exactly in the required format.' }];
        }
      } catch (e) {
        lastErr = e;
        break; // provider chain already tried everything
      }
    }
    this.usage.failures++;
    throw lastErr;
  }

  async decide(view: BuyerView): Promise<BuyerDecision & { fallback?: boolean }> {
    const system: ChatMessage = { role: 'system', content: buyerSystemPrompt(view) };
    const user: ChatMessage = { role: 'user', content: buyerRoundPrompt(view) };
    try {
      return (await this.ask([system, user], DecisionSchema)) as BuyerDecision;
    } catch (e) {
      return {
        thoughts: `(The model failed to answer this round: ${(e as Error).message.slice(0, 120)}. Holding.)`,
        actions: view.offers.map((o) => ({ vendor: o.vendorId, action: 'hold' as const, message: 'Give me a moment to consider.' })),
        fallback: true,
      };
    }
  }

  async reviewContract(view: ContractView): Promise<ContractDecision> {
    const system: ChatMessage = { role: 'system', content: buyerSystemPrompt({ ...view, maxRounds: view.scenario.maxRounds }) };
    try {
      return (await this.ask([system, { role: 'user', content: contractPrompt(view) }], ContractSchema)) as ContractDecision;
    } catch {
      return { decision: 'sign', reason: '(The model did not answer; the default is to sign.)' };
    }
  }
}

/** Writes all vendor messages for a round in one cheap call. */
export class LlmVoice implements VoiceAgent {
  constructor(
    private chain: ProviderChain,
    private signal?: AbortSignal,
  ) {}

  async write(ctx: VoiceContext, items: VoiceItem[]): Promise<Record<string, string>> {
    if (!items.length) return {};
    const brief = items
      .map((i) => {
        const move = {
          opening: 'opening offer',
          concede: `lowered the price from ${formatMoney(i.previousBase ?? i.basePrice)}`,
          hold: 'is not moving on price',
          accepting: 'AGREES to the buyer’s last counter',
          final: 'FINAL offer, will not go lower',
        }[i.move];
        return `- id "${i.vendorId}": ${i.name} (${i.tagline}); persona: ${i.voice}; move: ${move}; base price ${formatMoney(i.basePrice)}${
          i.includedAddons.length ? `; includes ${i.includedAddons.join(', ')}` : ''
        }${i.move === 'opening' && i.availableAddons.length ? `; optional add-ons: ${i.availableAddons.map((a) => `${a.label} +${formatMoney(a.price)}`).join(', ')}` : ''}${
          i.buyerMessage ? `; the buyer last said: "${i.buyerMessage.slice(0, 200)}"` : ''
        }`;
      })
      .join('\n');
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You write short in-character negotiation messages for vendors in a marketplace game. Each message: 1–2 sentences, under 40 words, in the vendor persona, must state the base price exactly as given, and must not invent other prices, fees, deadlines or terms. Reply with one JSON object mapping vendor id to message.',
      },
      { role: 'user', content: `Market: ${ctx.scenarioTitle}, round ${ctx.round}.\nVendors:\n${brief}\n\nJSON only, e.g. {"v1": "..."}` },
    ];
    const { text } = await this.chain.chat(messages, { tier: 'voice', json: true, temperature: 0.9, maxTokens: 700, signal: this.signal });
    const parsed = extractJson(text) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const i of items) {
      let m = typeof parsed[i.vendorId] === 'string' ? (parsed[i.vendorId] as string).trim() : '';
      const price = formatMoney(i.basePrice);
      // Keep the engine authoritative: a voice line that drops or garbles the price gets the template instead.
      if (!m || m.length > 400 || !m.replace(/\s/g, '').includes(price)) m = templateLine(ctx, i);
      out[i.vendorId] = m;
    }
    return out;
  }
}
