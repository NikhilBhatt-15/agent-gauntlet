import { attackPayload, checkDecision, type ArmedAttack } from './attacks.ts';
import type { BuyerAgent, BuyerOfferView, BuyerView } from './buyer.ts';
import {
  buildMarket,
  concessionOf,
  draftContract,
  initialVendorState,
  nextOffer,
  publicVendor,
  type Market,
  type VendorRuntime,
  type VendorState,
} from './market.ts';
import { publicScenario } from './scenarios.ts';
import { computeScore, type DealOutcome } from './scoring.ts';
import type {
  BuyerAction,
  BuyerDecision,
  Contract,
  EventInput,
  GauntletEvent,
  Offer,
  ScenarioDef,
  Scorecard,
  SeedMode,
} from './types.ts';
import { utility } from './utility.ts';
import { templateLine, type VendorMove, type VoiceAgent, type VoiceItem } from './voice.ts';

export interface Signer {
  sign(contract: Contract, events: GauntletEvent[]): Promise<{ contract: Contract; signature: string; kid: string }>;
}

export interface RunOptions {
  runId: string;
  scenario: ScenarioDef;
  seed: string;
  seedMode: SeedMode;
  instructions: string;
  buyer: BuyerAgent;
  voice: VoiceAgent;
  signer: Signer;
  emit?: (e: GauntletEvent) => void;
  buyerLabel?: string;
  clock?: () => number;
  /** abort between steps (e.g. server shutdown) */
  signal?: AbortSignal;
}

export interface RunResult {
  events: GauntletEvent[];
  score: Scorecard;
  market: Market;
}

/** Clean up whatever the buyer returned so the engine only sees legal actions. */
export function sanitizeDecision(raw: BuyerDecision, active: Set<string>): BuyerDecision {
  const seen = new Set<string>();
  let accepted = false;
  const actions: BuyerAction[] = [];
  for (const a of raw.actions ?? []) {
    if (!a || !active.has(a.vendor) || seen.has(a.vendor)) continue;
    seen.add(a.vendor);
    let action = a.action;
    const price = typeof a.price === 'number' && Number.isFinite(a.price) && a.price > 0 ? Math.round(a.price) : undefined;
    if (action === 'counter' && price === undefined) action = 'hold';
    if (action === 'accept') {
      if (accepted) action = 'hold';
      else accepted = true;
    }
    if (!['counter', 'accept', 'walk', 'hold'].includes(action)) action = 'hold';
    actions.push({
      vendor: a.vendor,
      action,
      ...(action === 'counter' ? { price } : {}),
      ...(Array.isArray(a.addons) && a.addons.length ? { addons: a.addons.map(String).slice(0, 5) } : {}),
      message: String(a.message ?? '').slice(0, 600),
    });
  }
  return { thoughts: String(raw.thoughts ?? '').slice(0, 800), actions };
}

function moveFor(offer: Offer, prev: number | null, round: number): VendorMove {
  if (offer.status === 'final') return 'final';
  if (offer.status === 'accepting') return 'accepting';
  if (round === 1 || prev === null) return 'opening';
  return offer.basePrice < prev ? 'concede' : 'hold';
}

export async function runGauntlet(opts: RunOptions): Promise<RunResult> {
  const { scenario, seed, runId, instructions, buyer, voice, signer } = opts;
  const clock = opts.clock ?? (() => Date.now());
  const start = clock();
  const market = buildMarket(scenario, seed);
  const events: GauntletEvent[] = [];
  const emit = (input: EventInput) => {
    const e = { ...input, seq: events.length, t: Math.max(0, clock() - start) } as GauntletEvent;
    events.push(e);
    opts.emit?.(e);
    return e;
  };
  const checkAbort = () => {
    if (opts.signal?.aborted) throw new Error('Run aborted');
  };

  const states = new Map<string, VendorState>(market.vendors.map((v) => [v.id, initialVendorState()]));
  const lastMessages = new Map<string, string>();
  const armed: ArmedAttack[] = [];
  const history: BuyerView['history'] = [];
  const pubScenario = publicScenario(scenario);
  let deal: DealOutcome | null = null;
  let roundsUsed = 0;

  emit({
    type: 'run.started',
    runId,
    scenario: pubScenario,
    vendors: market.vendors.map(publicVendor),
    maxRounds: scenario.maxRounds,
    buyer: buyer.info,
    seed,
    seedMode: opts.seedMode,
  });

  const active = () => market.vendors.filter((v) => states.get(v.id)!.status === 'active');

  outer: for (let round = 1; round <= scenario.maxRounds; round++) {
    checkAbort();
    roundsUsed = round;
    emit({ type: 'round.started', round });

    // 1. Vendors move (deterministic).
    const offers = new Map<string, Offer>();
    const voiceItems: VoiceItem[] = [];
    for (const v of active()) {
      const st = states.get(v.id)!;
      const prev = st.lastAsk;
      const offer = nextOffer(market, v, st, round);
      offers.set(v.id, offer);
      voiceItems.push({
        vendorId: v.id,
        name: v.persona.name,
        tagline: v.persona.tagline,
        voice: v.persona.voice,
        move: moveFor(offer, prev, round),
        basePrice: offer.basePrice,
        previousBase: prev,
        includedAddons: offer.addons.map((a) => a.label),
        availableAddons: v.addons.map((a) => ({ label: a.label, price: a.price })),
        buyerMessage: lastMessages.get(v.id) ?? null,
      });
    }

    // 2. Voices (one batched call; templates on failure).
    const vctx = { seed, round, scenarioTitle: scenario.title, unitNoun: scenario.unitNoun };
    let voiced: Record<string, string> = {};
    try {
      voiced = await voice.write(vctx, voiceItems);
    } catch {
      voiced = {};
    }
    checkAbort();

    // 3. Attach attacks and publish offers.
    const roundOffers: BuyerOfferView[] = [];
    for (const v of active()) {
      const offer = offers.get(v.id)!;
      const item = voiceItems.find((i) => i.vendorId === v.id)!;
      let message = (voiced[v.id] || templateLine(vctx, item)).trim();
      const deployedNow: { kind: ArmedAttack['kind']; excerpt: string }[] = [];
      for (const sa of v.attacks) {
        const isShady = sa.kind === 'hidden_fees' || sa.kind === 'bait_and_switch';
        if (sa.round === round || (isShady && round > sa.round)) {
          const payload = attackPayload(market, v, sa.kind, offer);
          message = isShady ? `${message} ${payload}` : `${message}\n\n${payload}`;
          if (sa.round === round) deployedNow.push({ kind: sa.kind, excerpt: payload });
        }
      }
      emit({
        type: 'vendor.offer',
        round,
        vendorId: v.id,
        offer,
        message,
        utility: Math.round(utility(scenario, offer.total, offer.attributes) * 1000) / 1000,
        concession: Math.round(concessionOf(v, offer.basePrice) * 100) / 100,
      });
      for (const d of deployedNow) {
        armed.push({ kind: d.kind, vendorId: v.id, round, excerpt: d.excerpt, landed: false, detail: '' });
        emit({ type: 'attack.deployed', round, vendorId: v.id, attack: d.kind, excerpt: d.excerpt });
      }
      roundOffers.push({
        vendorId: v.id,
        vendorName: v.persona.name,
        basePrice: offer.basePrice,
        addons: offer.addons,
        fees: offer.fees,
        attributes: offer.attributes,
        status: offer.status,
        message,
      });
    }

    // 4. Buyer decides.
    emit({ type: 'buyer.thinking', round });
    const view: BuyerView = {
      round,
      maxRounds: scenario.maxRounds,
      scenario: pubScenario,
      instructions,
      vendors: market.vendors.map((v) => ({
        id: v.id,
        name: v.persona.name,
        tagline: v.persona.tagline,
        status: states.get(v.id)!.status,
        availableAddons: v.addons.map((a) => ({ id: a.id, label: a.label, price: a.price })),
      })),
      offers: roundOffers,
      history: history.slice(),
    };
    const raw = await buyer.decide(view);
    checkAbort();
    const decision = sanitizeDecision(raw, new Set(offers.keys()));
    emit({ type: 'buyer.decision', round, thoughts: decision.thoughts, actions: decision.actions, ...(raw.fallback ? { fallback: true } : {}) });
    history.push({
      round,
      offers: [...offers.values()].map((o) => ({ vendorId: o.vendorId, basePrice: o.basePrice, status: o.status })),
      actions: decision.actions,
    });

    // 5. Attack predicates.
    for (const a of checkDecision(market, armed, decision, offers, instructions)) {
      emit({ type: 'attack.landed', round, vendorId: a.vendorId, attack: a.kind, detail: a.detail });
    }

    // 6. Apply counters and walks.
    for (const a of decision.actions) {
      const st = states.get(a.vendor)!;
      lastMessages.set(a.vendor, a.message);
      if (a.action === 'counter') {
        st.lastCounter = a.price!;
        if (a.addons) st.requestedAddons = a.addons;
      } else if (a.action === 'hold' && a.addons) {
        st.requestedAddons = a.addons;
      } else if (a.action === 'walk') {
        st.status = 'walked';
        emit({ type: 'vendor.walked', round, vendorId: a.vendor, reason: 'Buyer walked away' });
      }
    }

    // 7. Contract stage.
    const accept = decision.actions.find((a) => a.action === 'accept');
    if (accept) {
      const v = market.vendors.find((x) => x.id === accept.vendor)!;
      const offer = offers.get(v.id)!;
      const agreed = roundOffers.find((o) => o.vendorId === v.id)!;
      const outcome = await contractStage(v, offer, agreed, round);
      if (outcome) {
        deal = outcome;
        break outer;
      }
    }

    if (active().length === 0) {
      emit({ type: 'deal.none', reason: 'Your agent walked away from every vendor.' });
      break;
    }
    if (round === scenario.maxRounds) emit({ type: 'deal.none', reason: 'The final round ended without a deal.' });
  }

  async function contractStage(v: VendorRuntime, offer: Offer, agreed: BuyerOfferView, round: number): Promise<DealOutcome | null> {
    const base = { runId, round, buyer: opts.buyerLabel ?? 'Buyer agent', issuedAt: new Date(clock()).toISOString() };
    let tampered = v.tamperer;
    let tamperAttack: ArmedAttack | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      checkAbort();
      const contract = draftContract(market, v, offer, { ...base, tampered });
      emit({ type: 'contract.proposed', round, vendorId: v.id, contract, tampered });
      if (tampered && !tamperAttack) {
        tamperAttack = { kind: 'contract_tamper', vendorId: v.id, round, excerpt: scenario.tamper.to, landed: false, detail: '' };
        armed.push(tamperAttack);
        emit({ type: 'attack.deployed', round, vendorId: v.id, attack: 'contract_tamper', excerpt: scenario.tamper.to });
      }
      const review = await buyer.reviewContract({
        round,
        scenario: pubScenario,
        instructions,
        vendorName: v.persona.name,
        agreed,
        contract,
      });
      const decision = review.decision === 'sign' ? 'sign' : 'refuse';
      emit({ type: 'contract.reviewed', round, vendorId: v.id, decision, reason: String(review.reason ?? '').slice(0, 400) });
      if (decision === 'sign') {
        if (tampered && tamperAttack) {
          tamperAttack.landed = true;
          tamperAttack.detail = `Your agent signed ${v.persona.name}'s contract with a swapped clause: "${scenario.tamper.to}"`;
          emit({ type: 'attack.landed', round, vendorId: v.id, attack: 'contract_tamper', detail: tamperAttack.detail });
        }
        const signed = await signer.sign(contract, events);
        emit({ type: 'deal.closed', round, vendorId: v.id, contract: signed.contract, signature: signed.signature, kid: signed.kid });
        return { vendorId: v.id, offer, signedTampered: tampered };
      }
      if (!tampered) break;
      tampered = false; // caught: the vendor reissues a clean contract
    }
    states.get(v.id)!.status = 'walked';
    emit({ type: 'vendor.walked', round, vendorId: v.id, reason: 'Contract refused — deal off' });
    return null;
  }

  const score = computeScore(market, armed, deal, roundsUsed);
  emit({ type: 'run.scored', score });
  emit({ type: 'run.finished' });
  return { events, score, market };
}
