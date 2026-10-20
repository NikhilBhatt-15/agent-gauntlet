import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildMarket } from '../shared/market.ts';
import { dailySeed, randomSeed, todayUtc } from '../shared/rng.ts';
import { runGauntlet } from '../shared/runner.ts';
import { SimBuyer } from '../shared/sim-buyer.ts';
import type { GauntletEvent, LeaderboardEntry, RunRecord, ScenarioDef, SeedMode } from '../shared/types.ts';
import { templateVoice } from '../shared/voice.ts';
import { LlmBuyer, LlmVoice } from './agents.ts';
import type { ProviderSpec } from './config.ts';
import type { Escrow } from './escrow.ts';
import { ProviderChain } from './llm/client.ts';
import type { Semaphore } from './limits.ts';
import type { Store } from './store.ts';

type Listener = (e: GauntletEvent) => void;

interface StoredRun extends RunRecord {
  claimTokenHash?: string;
}

interface LiveRun {
  record: StoredRun;
  listeners: Set<Listener>;
  done: boolean;
  abort: AbortController;
}

export interface StartParams {
  scenario: ScenarioDef;
  instructions: string;
  seedMode: SeedMode;
  mode: 'llm' | 'sim';
  byok: ProviderSpec | null;
  publishInstructions: boolean;
  vendorVoice: 'llm' | 'template';
  onSettled?: (ok: boolean) => void;
}

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export class RunManager {
  private live = new Map<string, LiveRun>();
  private featured = new Map<string, RunRecord>();

  constructor(
    private store: Store,
    private escrow: Escrow,
    private chain: ProviderChain,
    private gate: Semaphore,
    featuredDir: string,
  ) {
    try {
      for (const f of fs.readdirSync(featuredDir).filter((x) => x.endsWith('.json'))) {
        const r = JSON.parse(fs.readFileSync(path.join(featuredDir, f), 'utf8')) as RunRecord;
        if (!r.id || !r.events?.length) continue;
        // bundled replays were recorded elsewhere: re-sign their contracts with this server's key
        for (const e of r.events) if (e.type === 'deal.closed') Object.assign(e, { signature: escrow.signSync(e.contract), kid: escrow.kid });
        this.featured.set(r.id, r);
      }
    } catch {
      /* no featured runs bundled */
    }
  }

  featuredList(): RunRecord[] {
    return [...this.featured.values()];
  }

  get activeCount() {
    return [...this.live.values()].filter((r) => !r.done).length;
  }

  start(p: StartParams): { runId: string; claimToken: string } {
    const runId = crypto.randomBytes(9).toString('base64url');
    const claimToken = crypto.randomBytes(18).toString('base64url');
    const day = todayUtc();
    const seed = p.seedMode === 'daily' ? dailySeed(p.scenario.id, day) : randomSeed();
    const chain = p.byok ? new ProviderChain([p.byok]) : this.chain;
    const record: StoredRun = {
      id: runId,
      createdAt: new Date().toISOString(),
      scenarioId: p.scenario.id,
      scenarioTitle: p.scenario.title,
      mode: p.mode,
      model: p.mode === 'sim' ? 'simulated buyer' : (chain.providers[0]?.buyerModel ?? 'unknown'),
      handle: null,
      score: null,
      grade: null,
      seedMode: p.seedMode,
      day: p.seedMode === 'daily' ? day : null,
      status: 'running',
      seed,
      instructions: p.instructions,
      publishInstructions: p.publishInstructions,
      events: [],
      claimTokenHash: sha(claimToken),
    };
    const live: LiveRun = { record, listeners: new Set(), done: false, abort: new AbortController() };
    this.live.set(runId, live);
    void this.execute(live, p, chain);
    return { runId, claimToken };
  }

  private publish(live: LiveRun, e: GauntletEvent) {
    live.record.events.push(e);
    for (const l of live.listeners) {
      try {
        l(e);
      } catch {
        /* a broken listener must not break the run */
      }
    }
  }

  private async execute(live: LiveRun, p: StartParams, chain: ProviderChain) {
    const { record } = live;
    const signal = live.abort.signal;
    const release = p.mode === 'llm' ? await this.gate.acquire() : () => {};
    let ok = false;
    try {
      const market = buildMarket(p.scenario, record.seed);
      const buyer = p.mode === 'sim' ? new SimBuyer(market, p.instructions) : new LlmBuyer(chain, signal);
      const voice = p.mode === 'sim' || p.vendorVoice === 'template' ? templateVoice : new LlmVoice(chain, signal);
      const result = await runGauntlet({
        runId: record.id,
        scenario: p.scenario,
        seed: record.seed,
        seedMode: p.seedMode,
        instructions: p.instructions,
        buyer,
        voice,
        signer: this.escrow,
        buyerLabel: 'Visitor’s buyer agent',
        signal,
        emit: (e) => this.publish(live, e),
      });
      if (buyer instanceof LlmBuyer) record.model = buyer.info.model;
      record.score = result.score.total;
      record.grade = result.score.grade;
      record.status = 'done';
      // A run where the model never answered is not a fair LLM result.
      const fallbacks = record.events.filter((e) => e.type === 'buyer.decision' && e.fallback).length;
      ok = fallbacks === 0;
    } catch (err) {
      record.status = 'error';
      const t = record.events.length ? record.events[record.events.length - 1].t : 0;
      this.publish(live, { type: 'run.error', message: (err as Error).message.slice(0, 300), seq: record.events.length, t });
      this.publish(live, { type: 'run.finished', seq: record.events.length, t });
    } finally {
      release();
      live.done = true;
      // Unpublished instructions are only needed while the run is live; never write them to disk.
      if (!record.publishInstructions) record.instructions = null;
      try {
        this.store.saveRun(record);
      } catch (e) {
        console.error('failed to persist run', record.id, e);
      }
      p.onSettled?.(ok);
      // keep in memory briefly for late subscribers
      setTimeout(() => this.live.delete(record.id), 10 * 60_000).unref?.();
    }
  }

  getStored(id: string): StoredRun | null {
    return this.live.get(id)?.record ?? this.featured.get(id) ?? this.store.getRun(id);
  }

  /** Public view: strip secrets and unpublished instructions. */
  getPublic(id: string): RunRecord | null {
    const r = this.getStored(id);
    if (!r) return null;
    const { claimTokenHash: _c, ...rest } = r as StoredRun;
    return { ...rest, instructions: r.publishInstructions || r.featured ? r.instructions : null };
  }

  /**
   * Replays buffered events after `afterSeq`, then streams live ones.
   * Returns an unsubscribe function, or null if the run does not exist.
   */
  subscribe(id: string, afterSeq: number, listener: Listener): (() => void) | null {
    const live = this.live.get(id);
    if (live) {
      for (const e of live.record.events) if (e.seq > afterSeq) listener(e);
      if (live.done) return () => {};
      live.listeners.add(listener);
      return () => live.listeners.delete(listener);
    }
    const stored = this.getStored(id);
    if (!stored) return null;
    for (const e of stored.events) if (e.seq > afterSeq) listener(e);
    return () => {};
  }

  isDone(id: string): boolean {
    const live = this.live.get(id);
    return live ? live.done : !!this.getStored(id);
  }

  claim(id: string, token: string, handle: string): { ok: true; entry: LeaderboardEntry } | { ok: false; error: string } {
    const r = this.getStored(id) as StoredRun | null;
    if (!r || r.featured) return { ok: false, error: 'Run not found' };
    if (r.status !== 'done' || r.score === null) return { ok: false, error: 'Run is not finished' };
    if (!r.claimTokenHash || sha(token) !== r.claimTokenHash) return { ok: false, error: 'Only the creator can submit this run' };
    if (r.handle) return { ok: false, error: 'Already on the leaderboard' };
    const fallback = r.events.some((e) => e.type === 'buyer.decision' && e.fallback);
    if (fallback) return { ok: false, error: 'The model failed to answer in this run, so it cannot be ranked' };
    r.handle = handle;
    const entry: LeaderboardEntry = {
      runId: r.id,
      handle,
      scenarioId: r.scenarioId,
      score: r.score,
      grade: r.grade ?? 'F',
      mode: r.mode,
      model: r.model,
      day: r.day,
      createdAt: r.createdAt,
      instructions: r.publishInstructions ? r.instructions : null,
    };
    this.store.saveRun(r);
    this.store.addToLeaderboard(entry);
    return { ok: true, entry };
  }

  shutdown() {
    for (const l of this.live.values()) l.abort.abort();
  }
}
