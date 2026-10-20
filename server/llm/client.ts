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
  return {};
}

/** One OpenAI-compatible chat completion. */
export async function chatOnce(p: ProviderSpec, messages: ChatMessage[], opts: ChatOptions): Promise<string> {
  const model = opts.tier === 'buyer' ? p.buyerModel : p.voiceModel;
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
          ...(p.id === 'openrouter' ? { 'HTTP-Referer': 'https://github.com/NikhilBhatt-15/agent-gauntlet', 'X-Title': 'Agent Gauntlet' } : {}),
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

/** Ordered providers with per-provider cooldown after rate limits or outages. */
export class ProviderChain {
  private cooldownUntil = new Map<string, number>();

  constructor(readonly providers: ProviderSpec[]) {}

  get available(): boolean {
    return this.providers.length > 0;
  }

  /** at least one provider is not cooling down after a rate limit */
  get anyReady(): boolean {
    const now = Date.now();
    return this.providers.some((p) => (this.cooldownUntil.get(p.id) ?? 0) <= now);
  }

  status() {
    const now = Date.now();
    return this.providers.map((p) => ({
      id: p.id,
      label: p.label,
      buyerModel: p.buyerModel,
      voiceModel: p.voiceModel,
      coolingDownForMs: Math.max(0, (this.cooldownUntil.get(p.id) ?? 0) - now),
    }));
  }

  async chat(messages: ChatMessage[], opts: ChatOptions): Promise<{ text: string; provider: ProviderSpec }> {
    const now = Date.now();
    const ready = this.providers.filter((p) => (this.cooldownUntil.get(p.id) ?? 0) <= now);
    // If everything is cooling down, try the one that frees up first anyway.
    const queue = ready.length
      ? ready
      : [...this.providers].sort((a, b) => (this.cooldownUntil.get(a.id) ?? 0) - (this.cooldownUntil.get(b.id) ?? 0)).slice(0, 1);
    let lastErr: unknown = new LlmError('No LLM provider configured', 503);
    for (const p of queue) {
      try {
        return { text: await chatOnce(p, messages, opts), provider: p };
      } catch (e) {
        lastErr = e;
        if (opts.signal?.aborted) throw e;
        const status = e instanceof LlmError ? e.status : 500;
        if (status === 429) this.cooldownUntil.set(p.id, Date.now() + ((e as LlmError).retryAfterMs ?? 60_000));
        else if (status >= 500 || status === 404) this.cooldownUntil.set(p.id, Date.now() + 20_000);
        else if (status === 401 || status === 403) this.cooldownUntil.set(p.id, Date.now() + 10 * 60_000);
      }
    }
    throw lastErr;
  }
}

/** Pull the first JSON object out of a model reply (handles ```json fences and chatter). */
export function extractJson(text: string): unknown {
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
