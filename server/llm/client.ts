import type { ProviderSpec } from '../config.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  tier: 'buyer' | 'voice';
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** override the model (defaults to the tier's first model) */
  model?: string;
}

/** A provider's models for a tier. Env values may list fallbacks: "openai/gpt-oss-120b,openai/gpt-oss-20b". */
export function modelsFor(p: ProviderSpec, tier: 'buyer' | 'voice'): string[] {
  return (tier === 'buyer' ? p.buyerModel : p.voiceModel)
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
  }
}

function extraBody(p: ProviderSpec, model: string): Record<string, unknown> {
  // gpt-oss models reason before answering; keep that short to save free-tier tokens.
  if (p.id === 'groq' && model.startsWith('openai/gpt-oss')) return { reasoning_effort: 'low' };
  // Gemini thinking models can take 40 s+ at default effort on the free tier.
  if (p.id === 'gemini') return { reasoning_effort: 'low' };
  return {};
}

/** One OpenAI-compatible chat completion. */
export async function chatOnce(p: ProviderSpec, messages: ChatMessage[], opts: ChatOptions): Promise<string> {
  const model = opts.model ?? modelsFor(p, opts.tier)[0];
  const attempt = async (useJson: boolean, useExtra: boolean) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45000);
    const onAbort = () => ctrl.abort();
    opts.signal?.addEventListener('abort', onAbort);
    try {
      const res = await fetch(`${p.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {}),
          ...(p.id === 'openrouter' ? { 'HTTP-Referer': 'https://github.com/NikhilBhatt-15/molbhav', 'X-Title': 'Mol-Bhav' } : {}),
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 900,
          ...(useJson ? { response_format: { type: 'json_object' } } : {}),
          ...(useExtra ? extraBody(p, model) : {}),
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        const ra = res.headers.get('retry-after');
        const retryAfterMs = ra && Number.isFinite(Number(ra)) ? Number(ra) * 1000 : null;
        throw new LlmError(`${p.label} ${res.status}: ${text.slice(0, 300)}`, res.status, retryAfterMs);
      }
      let data: { choices?: { message?: { content?: string | null } }[] };
      try {
        data = JSON.parse(text);
      } catch {
        throw new LlmError(`${p.label}: non-JSON response`, 502);
      }
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new LlmError(`${p.label}: empty completion`, 502);
      return content;
    } catch (e) {
      if (e instanceof LlmError) throw e;
      if ((e as Error).name === 'AbortError') throw new LlmError(`${p.label}: timed out`, 504);
      throw new LlmError(`${p.label}: ${(e as Error).message}`, 503);
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
  };

  const hasExtra = Object.keys(extraBody(p, model)).length > 0;
  try {
    return await attempt(!!opts.json, hasExtra);
  } catch (e) {
    // Some endpoints reject response_format or vendor-specific params: retry plain once.
    if (e instanceof LlmError && e.status === 400 && (opts.json || hasExtra)) return attempt(false, false);
    throw e;
  }
}

/**
 * Ordered (provider, model) routes with a cooldown per route after rate limits or outages.
 * Free tiers limit tokens per minute *per model*, so a provider's fallback models are separate routes.
 */
export class ProviderChain {
  private cooldownUntil = new Map<string, number>();

  constructor(readonly providers: ProviderSpec[]) {}

  get available(): boolean {
    return this.providers.length > 0;
  }

  private routes(tier: 'buyer' | 'voice') {
    return this.providers.flatMap((p) => modelsFor(p, tier).map((model) => ({ p, model, key: `${p.id}|${model}` })));
  }

  private waitFor(key: string) {
    return Math.max(0, (this.cooldownUntil.get(key) ?? 0) - Date.now());
  }

  /** at least one buyer route is not cooling down */
  get anyReady(): boolean {
    return this.routes('buyer').some((r) => this.waitFor(r.key) === 0);
  }

  status() {
    return this.providers.map((p) => {
      const buyer = modelsFor(p, 'buyer');
      return {
        id: p.id,
        label: p.label,
        buyerModel: buyer[0] ?? '',
        buyerFallbacks: buyer.slice(1),
        voiceModel: modelsFor(p, 'voice')[0] ?? '',
        coolingDownForMs: Math.min(...buyer.map((m) => this.waitFor(`${p.id}|${m}`))),
      };
    });
  }

  async chat(messages: ChatMessage[], opts: ChatOptions, retried = false): Promise<{ text: string; provider: ProviderSpec; model: string }> {
    const all = this.routes(opts.tier);
    const ready = all.filter((r) => this.waitFor(r.key) === 0);
    let lastErr: unknown = new LlmError('No LLM provider configured', 503);
    for (const r of ready) {
      try {
        return { text: await chatOnce(r.p, messages, { ...opts, model: r.model }), provider: r.p, model: r.model };
      } catch (e) {
        lastErr = e;
        if (opts.signal?.aborted) throw e;
        const status = e instanceof LlmError ? e.status : 500;
        const cool = status === 429 ? ((e as LlmError).retryAfterMs ?? 60_000) : status === 401 || status === 403 ? 10 * 60_000 : status >= 500 || status === 404 ? 20_000 : 0;
        if (cool) this.cooldownUntil.set(r.key, Date.now() + cool);
        console.warn(`[llm] ${r.p.label} ${r.model} (${opts.tier}) failed: ${status}${cool ? `, cooling ${Math.round(cool / 1000)}s` : ''}`);
      }
    }
    // Everything is briefly rate-limited (typical for per-minute token caps): wait it out once.
    const soonest = Math.min(...all.map((r) => this.waitFor(r.key)));
    if (!retried && all.length && soonest > 0 && soonest <= 12_000 && !opts.signal?.aborted) {
      await new Promise((res) => setTimeout(res, soonest + 250));
      return this.chat(messages, opts, true);
    }
    throw lastErr;
  }
}

/** Pull the first JSON object out of a model reply (handles ```json fences and chatter). */
export function extractJson(text: string): unknown {
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, ''); // reasoning models (e.g. Qwen) may think out loud
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  if (start < 0) throw new Error('no JSON object in reply');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return JSON.parse(body.slice(start, i + 1));
    }
  }
  throw new Error('unterminated JSON object in reply');
}
