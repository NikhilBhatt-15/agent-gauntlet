/**
 * Records the showcase replays bundled in server/featured/.
 *   npm run record            → simulated buyer (no keys needed)
 *   npm run record -- --llm   → real LLM buyer using the same env vars as the server
 * For each showcase it searches seeds for the most dramatic run that fits the story.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildMarket } from '../shared/market.ts';
import { runGauntlet, type RunResult } from '../shared/runner.ts';
import { getScenario } from '../shared/scenarios.ts';
import { SimBuyer } from '../shared/sim-buyer.ts';
import type { RunRecord } from '../shared/types.ts';
import { templateVoice } from '../shared/voice.ts';
import { PRESETS } from '../web/src/lib/presets.ts';
import { LlmBuyer, LlmVoice } from '../server/agents.ts';
import { config } from '../server/config.ts';
import { createEscrow } from '../server/escrow.ts';
import { ProviderChain } from '../server/llm/client.ts';

const useLlm = process.argv.includes('--llm');
const chain = new ProviderChain(config.providers);
if (useLlm && !chain.available) throw new Error('--llm needs GROQ_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY in the environment');
const escrow = createEscrow(fs.mkdtempSync(path.join(os.tmpdir(), 'gauntlet-rec-')), null);

interface Show {
  id: string;
  title: string;
  blurb: string;
  scenario: string;
  preset: string;
  /** higher = more dramatic for this story */
  drama: (r: RunResult) => number;
}

const landed = (r: RunResult) => r.score.attacks.filter((a) => a.outcome === 'landed').length;
const hasAttack = (r: RunResult, k: string) => r.score.attacks.some((a) => a.attack === k);

const SHOWS: Show[] = [
  {
    id: 'featured-pushover',
    title: 'The Pushover',
    blurb: 'A friendly agent walks into a den of con artists.',
    scenario: 'offsite',
    preset: 'pushover',
    drama: (r) => landed(r) * 10 + (hasAttack(r, 'prompt_injection') ? 5 : 0) + (r.score.dealVendorId ? 3 : 0),
  },
  {
    id: 'featured-fortress',
    title: 'The Fortress',
    blurb: 'A paranoid agent catches a forged contract.',
    scenario: 'gpu',
    preset: 'fortress',
    drama: (r) => (hasAttack(r, 'contract_tamper') ? 50 : 0) + r.score.total - landed(r) * 30,
  },
  {
    id: 'featured-haggler',
    title: 'The Haggler',
    blurb: 'Brilliant negotiator, zero street smarts.',
    scenario: 'video',
    preset: 'haggler',
    drama: (r) => landed(r) * 10 + r.score.deal,
  },
];

const outDir = path.resolve('server/featured');
fs.mkdirSync(outDir, { recursive: true });

for (const show of SHOWS) {
  const scenario = getScenario(show.scenario)!;
  const instructions = PRESETS.find((p) => p.id === show.preset)!.text;
  let best: { seed: string; r: RunResult; d: number } | null = null;
  const tries = useLlm ? 1 : 120;
  for (let i = 0; i < tries; i++) {
    const seed = `${show.id}-${i}`;
    const market = buildMarket(scenario, seed);
    const r = await runGauntlet({
      runId: show.id,
      scenario,
      seed,
      seedMode: 'random',
      instructions,
      buyer: useLlm ? new LlmBuyer(chain) : new SimBuyer(market, instructions),
      voice: useLlm ? new LlmVoice(chain) : templateVoice,
      signer: escrow,
      buyerLabel: 'Featured buyer agent',
    });
    const d = show.drama(r);
    if (!best || d > best.d) best = { seed, r, d };
  }
  const { r, seed } = best!;
  const started = r.events[0].type === 'run.started' ? r.events[0] : null;
  const record: RunRecord = {
    id: show.id,
    createdAt: new Date().toISOString(),
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    mode: useLlm ? 'llm' : 'sim',
    model: started?.buyer.model ?? 'simulated buyer',
    handle: null,
    score: r.score.total,
    grade: r.score.grade,
    seedMode: 'random',
    day: null,
    status: 'done',
    seed,
    instructions,
    publishInstructions: true,
    events: r.events,
    featured: { title: show.title, blurb: show.blurb },
  };
  fs.writeFileSync(path.join(outDir, `${show.id}.json`), JSON.stringify(record));
  console.log(`${show.title.padEnd(14)} ${scenario.id.padEnd(8)} seed=${seed.padEnd(22)} score=${r.score.total} ${r.score.grade}  landed=${landed(r)}/${r.score.deployed}  ${r.score.verdict}`);
}
