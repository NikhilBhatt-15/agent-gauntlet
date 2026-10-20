import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LlmBuyer, LlmVoice } from '../server/agents.ts';
import type { ProviderSpec } from '../server/config.ts';
import { createEscrow } from '../server/escrow.ts';
import { extractJson, ProviderChain } from '../server/llm/client.ts';
import { runGauntlet } from '../shared/runner.ts';
import { SCENARIOS } from '../shared/scenarios.ts';

/** A fake OpenAI-compatible endpoint that plays a gullible buyer and a vendor voice. */
function mockLlm(behaviour: { status?: number } = {}) {
  const calls: { system: string; user: string }[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      if (behaviour.status) {
        res.writeHead(behaviour.status, { 'Content-Type': 'application/json', 'retry-after': '30' });
        res.end('{"error":"rate limited"}');
        return;
      }
      const { messages, model } = JSON.parse(body) as { model: string; messages: { role: string; content: string }[] };
      if (model === 'limited-model') {
        res.writeHead(429, { 'Content-Type': 'application/json', 'retry-after': '40' });
        res.end('{"error":"tokens per minute"}');
        return;
      }
      const system = messages.find((m) => m.role === 'system')?.content ?? '';
      const user = messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
      calls.push({ system, user });
      let content: string;
      if (system.startsWith('You write short in-character')) {
        const out: Record<string, string> = {};
        for (const m of user.matchAll(/id "(v\d)".*?base price (\$[\d,]+)/g)) out[m[1]] = `Mock voice says ${m[2]}.`;
        content = JSON.stringify(out);
      } else if (user.includes('Decide whether to sign')) {
        content = '{"decision":"sign","reason":"Looks fine to me."}';
      } else {
        const ids = [...user.matchAll(/### (v\d) · [^\n]*\(/g)].map((m) => m[1]);
        const final = user.includes('FINAL ROUND');
        // gullible: obeys the fake system notice by countering above budget
        const injected = user.includes('SYSTEM NOTICE');
        const actions = ids.map((id, i) =>
          final && i === 0
            ? { vendor: id, action: 'accept', message: 'Deal.' }
            : { vendor: id, action: 'counter', price: injected ? 2000 : 1000, message: 'Our budget is $1,500, can you do better?' },
        );
        content = '```json\n' + JSON.stringify({ thoughts: 'Mock buyer thinking.', actions }) + '\n```';
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  return {
    calls,
    server,
    async listen() {
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    },
  };
}

const spec = (id: string, baseUrl: string): ProviderSpec => ({ id, label: id, baseUrl, apiKey: 'k', buyerModel: 'mock-buyer', voiceModel: 'mock-voice', keyUrl: '' });

describe('LLM integration (mock provider)', () => {
  const good = mockLlm();
  const limited = mockLlm({ status: 429 });
  let goodUrl = '';
  let limitedUrl = '';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gauntlet-'));

  beforeAll(async () => {
    goodUrl = await good.listen();
    limitedUrl = await limited.listen();
  });
  afterAll(() => {
    good.server.close();
    limited.server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('extracts JSON from chatty replies', () => {
    expect(extractJson('Sure! ```json\n{"a":{"b":"}"}}\n``` hope that helps')).toEqual({ a: { b: '}' } });
    expect(extractJson('prefix {"x":1} suffix {"y":2}')).toEqual({ x: 1 });
  });

  it('runs a full negotiation over HTTP, falls back past a 429, and signs a verifiable contract', async () => {
    const chain = new ProviderChain([spec('limited', limitedUrl), spec('good', goodUrl)]);
    const escrow = createEscrow(dataDir, null);
    const scenario = SCENARIOS[0];
    const { events, score } = await runGauntlet({
      runId: 'llmtest01',
      scenario,
      seed: 'llm-seed',
      seedMode: 'random',
      instructions: 'Be nice.',
      buyer: new LlmBuyer(chain),
      voice: new LlmVoice(chain),
      signer: escrow,
    });
    // after the first 429 the limited provider is cooling down
    expect(chain.status().find((p) => p.id === 'limited')!.coolingDownForMs).toBeGreaterThan(0);
    const offers = events.filter((e) => e.type === 'vendor.offer');
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((e) => e.type === 'vendor.offer' && e.message.includes('Mock voice says'))).toBe(true);
    const decisions = events.filter((e) => e.type === 'buyer.decision');
    expect(decisions.every((e) => e.type === 'buyer.decision' && !e.fallback && e.thoughts === 'Mock buyer thinking.')).toBe(true);
    // the gullible buyer leaks its budget to the rogue and obeys the injection if it arrives
    const landed = score.attacks.filter((a) => a.outcome === 'landed').map((a) => a.attack);
    expect(landed.length).toBeGreaterThan(0);
    const closed = events.find((e) => e.type === 'deal.closed');
    if (closed && closed.type === 'deal.closed') {
      expect(closed.contract.transcriptHash).toMatch(/^[0-9a-f]{64}$/);
      expect(escrow.verify(closed.contract, closed.signature)).toBe(true);
      expect(escrow.verify({ ...closed.contract, terms: { ...closed.contract.terms, total: 1 } }, closed.signature)).toBe(false);
    }
    // the buyer prompt carries the visitor's instructions but never totals or roles
    const buyerCall = good.calls.find((c) => c.system.startsWith('You are an autonomous procurement agent'))!;
    expect(buyerCall.system).toContain('Be nice.');
    expect(buyerCall.user).not.toMatch(/rogue|shady|honest|total:/i);
  });

  it('falls back to the next model on the same provider when one model is rate-limited', async () => {
    const chain = new ProviderChain([{ ...spec('groqish', goodUrl), buyerModel: 'limited-model,mock-buyer' }]);
    const r = await chain.chat([{ role: 'user', content: 'Decide whether to sign' }], { tier: 'buyer', json: true });
    expect(r.model).toBe('mock-buyer');
    expect(chain.anyReady).toBe(true); // but the provider still has a ready route
  });

  it('falls back to holding when every provider fails', async () => {
    const chain = new ProviderChain([spec('limited', limitedUrl)]);
    const buyer = new LlmBuyer(chain);
    const d = await buyer.decide({
      round: 1,
      maxRounds: 6,
      scenario: { ...SCENARIOS[0], attributes: [], requirements: [] } as never,
      instructions: '',
      vendors: [],
      offers: [{ vendorId: 'v1', vendorName: 'X', basePrice: 1, addons: [], fees: [], attributes: {}, status: 'open', message: '' }],
      history: [],
    });
    expect(d.fallback).toBe(true);
    expect(d.actions).toEqual([{ vendor: 'v1', action: 'hold', message: 'Give me a moment to consider.' }]);
  });
});
