import type {
  AttackKind,
  BuyerAction,
  BuyerInfo,
  Contract,
  GauntletEvent,
  Offer,
  PublicScenario,
  PublicVendor,
  Scorecard,
  SeedMode,
} from './types.ts';

export interface VendorView extends PublicVendor {
  status: 'active' | 'walked' | 'deal';
  offers: Offer[];
  utilities: number[];
  concession: number;
  lastMessage: string;
  lastBuyerAction: BuyerAction | null;
  activeAttack: AttackKind | null;
}

export interface TranscriptEntry {
  seq: number;
  round: number;
  from: 'vendor' | 'buyer' | 'system';
  vendorId?: string;
  text: string;
  action?: BuyerAction;
  attack?: AttackKind;
  tone?: 'danger' | 'success' | 'info';
}

export interface AttackView {
  key: string;
  attack: AttackKind;
  vendorId: string;
  round: number;
  excerpt: string;
  status: 'deployed' | 'landed' | 'resisted';
  detail: string;
}

export interface RoomState {
  runId: string | null;
  scenario: PublicScenario | null;
  buyer: BuyerInfo | null;
  seed: string | null;
  seedMode: SeedMode | null;
  maxRounds: number;
  round: number;
  phase: 'idle' | 'offers' | 'thinking' | 'contract' | 'done' | 'error';
  vendors: Record<string, VendorView>;
  order: string[];
  transcript: TranscriptEntry[];
  thoughts: { round: number; text: string; fallback?: boolean }[];
  attacks: Record<string, AttackView>;
  contract: { vendorId: string; contract: Contract; tampered: boolean; decision?: 'sign' | 'refuse'; reason?: string } | null;
  deal: { vendorId: string; contract: Contract; signature: string; kid: string } | null;
  noDeal: string | null;
  score: Scorecard | null;
  error: string | null;
  lastSeq: number;
  /** most recent attack event, for flashes */
  flash: { seq: number; kind: 'deployed' | 'landed'; attack: AttackKind; vendorId: string } | null;
}

export const emptyRoom: RoomState = {
  runId: null,
  scenario: null,
  buyer: null,
  seed: null,
  seedMode: null,
  maxRounds: 6,
  round: 0,
  phase: 'idle',
  vendors: {},
  order: [],
  transcript: [],
  thoughts: [],
  attacks: {},
  contract: null,
  deal: null,
  noDeal: null,
  score: null,
  error: null,
  lastSeq: -1,
  flash: null,
};

const attackKey = (vendorId: string, attack: AttackKind) => `${vendorId}:${attack}`;

export function reduceEvent(s: RoomState, e: GauntletEvent): RoomState {
  if (e.seq <= s.lastSeq) return s;
  const next: RoomState = { ...s, lastSeq: e.seq };
  const vendor = (id: string) => next.vendors[id];
  const patchVendor = (id: string, patch: Partial<VendorView>) => {
    if (!next.vendors[id]) return;
    next.vendors = { ...next.vendors, [id]: { ...next.vendors[id], ...patch } };
  };
  const log = (entry: Omit<TranscriptEntry, 'seq'>) => {
    next.transcript = [...next.transcript, { ...entry, seq: e.seq }];
  };

  switch (e.type) {
    case 'run.started':
      return {
        ...emptyRoom,
        lastSeq: e.seq,
        runId: e.runId,
        scenario: e.scenario,
        buyer: e.buyer,
        seed: e.seed,
        seedMode: e.seedMode,
        maxRounds: e.maxRounds,
        order: e.vendors.map((v) => v.id),
        vendors: Object.fromEntries(
          e.vendors.map((v) => [
            v.id,
            { ...v, status: 'active', offers: [], utilities: [], concession: 0, lastMessage: '', lastBuyerAction: null, activeAttack: null } as VendorView,
          ]),
        ),
      };
    case 'round.started':
      next.round = e.round;
      next.phase = 'offers';
      next.vendors = Object.fromEntries(Object.entries(next.vendors).map(([id, v]) => [id, { ...v, activeAttack: null }]));
      log({ round: e.round, from: 'system', text: `Round ${e.round}${e.round === next.maxRounds ? ' — final round' : ''}`, tone: 'info' });
      break;
    case 'vendor.offer': {
      const v = vendor(e.vendorId);
      if (!v) break;
      patchVendor(e.vendorId, {
        offers: [...v.offers, e.offer],
        utilities: [...v.utilities, e.utility],
        concession: e.concession,
        lastMessage: e.message,
      });
      log({ round: e.round, from: 'vendor', vendorId: e.vendorId, text: e.message });
      break;
    }
    case 'attack.deployed': {
      const key = attackKey(e.vendorId, e.attack);
      next.attacks = {
        ...next.attacks,
        [key]: { key, attack: e.attack, vendorId: e.vendorId, round: e.round, excerpt: e.excerpt, status: 'deployed', detail: '' },
      };
      patchVendor(e.vendorId, { activeAttack: e.attack });
      next.flash = { seq: e.seq, kind: 'deployed', attack: e.attack, vendorId: e.vendorId };
      // tag the vendor's latest message (a contract tamper isn't in a message)
      for (let i = next.transcript.length - 1; i >= 0 && e.attack !== 'contract_tamper'; i--) {
        const t = next.transcript[i];
        if (t.vendorId === e.vendorId && t.from === 'vendor') {
          next.transcript = next.transcript.map((x, j) => (j === i ? { ...x, attack: e.attack } : x));
          break;
        }
      }
      break;
    }
    case 'buyer.thinking':
      next.phase = 'thinking';
      break;
    case 'buyer.decision':
      next.phase = 'offers';
      next.thoughts = [...next.thoughts, { round: e.round, text: e.thoughts, fallback: e.fallback }];
      for (const a of e.actions) {
        patchVendor(a.vendor, { lastBuyerAction: a });
        log({ round: e.round, from: 'buyer', vendorId: a.vendor, text: a.message, action: a });
      }
      break;
    case 'attack.landed': {
      const key = attackKey(e.vendorId, e.attack);
      const prev = next.attacks[key];
      next.attacks = {
        ...next.attacks,
        [key]: { ...(prev ?? { key, attack: e.attack, vendorId: e.vendorId, round: e.round, excerpt: '' }), status: 'landed', detail: e.detail },
      };
      next.flash = { seq: e.seq, kind: 'landed', attack: e.attack, vendorId: e.vendorId };
      log({ round: e.round, from: 'system', vendorId: e.vendorId, text: e.detail, attack: e.attack, tone: 'danger' });
      break;
    }
    case 'vendor.walked':
      patchVendor(e.vendorId, { status: 'walked' });
      log({ round: e.round, from: 'system', vendorId: e.vendorId, text: `${vendor(e.vendorId)?.name ?? e.vendorId}: ${e.reason}`, tone: 'info' });
      break;
    case 'contract.proposed':
      next.phase = 'contract';
      next.contract = { vendorId: e.vendorId, contract: e.contract, tampered: e.tampered };
      log({ round: e.round, from: 'system', vendorId: e.vendorId, text: `${vendor(e.vendorId)?.name} sent a contract for signature.`, tone: 'info' });
      break;
    case 'contract.reviewed':
      if (next.contract) next.contract = { ...next.contract, decision: e.decision, reason: e.reason };
      log({
        round: e.round,
        from: 'buyer',
        vendorId: e.vendorId,
        text: `${e.decision === 'sign' ? 'Signs' : 'Refuses'} the contract — ${e.reason}`,
        tone: e.decision === 'sign' ? 'success' : 'info',
      });
      break;
    case 'deal.closed':
      next.deal = { vendorId: e.vendorId, contract: e.contract, signature: e.signature, kid: e.kid };
      patchVendor(e.vendorId, { status: 'deal' });
      log({ round: e.round, from: 'system', vendorId: e.vendorId, text: `Deal closed with ${vendor(e.vendorId)?.name}. Escrow signed the contract.`, tone: 'success' });
      break;
    case 'deal.none':
      next.noDeal = e.reason;
      log({ round: next.round, from: 'system', text: e.reason, tone: 'info' });
      break;
    case 'run.scored': {
      next.score = e.score;
      const attacks = { ...next.attacks };
      for (const a of e.score.attacks) {
        const key = attackKey(a.vendorId, a.attack);
        attacks[key] = { key, attack: a.attack, vendorId: a.vendorId, round: a.round, excerpt: a.excerpt, status: a.outcome, detail: a.detail };
      }
      next.attacks = attacks;
      break;
    }
    case 'run.error':
      next.phase = 'error';
      next.error = e.message;
      break;
    case 'run.finished':
      if (next.phase !== 'error') next.phase = 'done';
      break;
  }
  return next;
}

export function reduceRun(events: GauntletEvent[], upTo = Infinity): RoomState {
  let s = emptyRoom;
  for (const e of events) {
    if (e.seq > upTo) break;
    s = reduceEvent(s, e);
  }
  return s;
}
