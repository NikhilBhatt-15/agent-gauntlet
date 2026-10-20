// Data model and wire protocol. See docs/DESIGN.md §2 and §4.

export type AttrValue = number | boolean | string;
export type Attrs = Record<string, AttrValue>;

export interface AttributeDef {
  id: string;
  label: string;
  kind: 'number' | 'boolean' | 'enum';
  unit?: string;
  min?: number;
  max?: number;
  direction: 'higher' | 'lower';
  /** enum options ordered worst → best */
  options?: string[];
}

export interface Requirement {
  attribute: string;
  op: '>=' | '<=' | '==';
  value: AttrValue;
  label: string;
}

export type Tactic = 'boulware' | 'linear' | 'conceder';
export type Role = 'honest' | 'shady' | 'rogue';

export interface AddonDef {
  id: string;
  label: string;
  price: number;
  /** attributes this add-on sets when included */
  sets: Attrs;
}

export interface FeeDef {
  label: string;
  /** fixed amount */
  amount?: number;
  /** share of base price, e.g. 0.22 */
  rate?: number;
}

export interface VendorSlot {
  key: string;
  role: Role;
  listPrice: number;
  floorPrice: number;
  tactic: Tactic;
  attributes: Attrs;
  addons: AddonDef[];
  /** shady vendor, hidden_fees variant */
  fees?: FeeDef[];
  /** shady vendor, bait_and_switch variant: overrides attributes and prices */
  baitVariant?: { listPrice: number; floorPrice: number; attributes: Attrs };
  /** spectator-facing description of the archetype */
  archetype: string;
}

export interface VendorPersona {
  name: string;
  tagline: string;
  hue: number;
  voice: string;
}

export interface ScenarioDef {
  id: string;
  title: string;
  tagline: string;
  icon: string;
  brief: string;
  unitNoun: string;
  currency: 'USD';
  budget: number;
  idealPrice: number;
  maxRounds: number;
  attributes: AttributeDef[];
  requirements: Requirement[];
  priceWeight: number;
  attributeWeights: Record<string, number>;
  slots: VendorSlot[];
  personas: VendorPersona[];
  /** what the bait-and-switch vendor claims in prose */
  baitClaim: string;
  /** standard contract clauses */
  clauses: string[];
  /** the tamperer replaces clause[index] with `to` */
  tamper: { index: number; to: string };
}

export type AttackKind =
  | 'prompt_injection'
  | 'fake_urgency'
  | 'impersonation'
  | 'data_exfiltration'
  | 'hidden_fees'
  | 'bait_and_switch'
  | 'contract_tamper';

export interface LineItem {
  id?: string;
  label: string;
  amount: number;
}

export type OfferStatus = 'open' | 'accepting' | 'final' | 'withdrawn';

export interface Offer {
  id: string;
  vendorId: string;
  round: number;
  basePrice: number;
  addons: { id: string; label: string; price: number }[];
  fees: LineItem[];
  attributes: Attrs;
  total: number;
  status: OfferStatus;
}

/** What spectators know about a vendor at run start (no floors, no roles). */
export interface PublicVendor {
  id: string;
  name: string;
  tagline: string;
  hue: number;
  availableAddons: { id: string; label: string; price: number }[];
}

/** Revealed at the end of a run. */
export interface VendorReveal {
  id: string;
  role: Role;
  archetype: string;
  floorPrice: number;
  listPrice: number;
  tactic: Tactic;
  tamperer: boolean;
  attacks: AttackKind[];
}

export interface PublicScenario {
  id: string;
  title: string;
  tagline: string;
  icon: string;
  brief: string;
  budget: number;
  idealPrice: number;
  currency: 'USD';
  maxRounds: number;
  attributes: AttributeDef[];
  requirements: Requirement[];
}

export type BuyerActionType = 'counter' | 'accept' | 'walk' | 'hold';

export interface BuyerAction {
  vendor: string;
  action: BuyerActionType;
  price?: number;
  addons?: string[];
  message: string;
}

export interface BuyerDecision {
  thoughts: string;
  actions: BuyerAction[];
}

export interface ContractDecision {
  decision: 'sign' | 'refuse';
  reason: string;
}

export interface Contract {
  version: 1;
  contractId: string;
  runId: string;
  scenarioId: string;
  scenarioTitle: string;
  buyer: string;
  vendor: { id: string; name: string };
  terms: {
    basePrice: number;
    addons: { id: string; label: string; price: number }[];
    fees: LineItem[];
    total: number;
    attributes: Attrs;
  };
  clauses: string[];
  agreedRound: number;
  issuedAt: string;
  transcriptHash?: string;
}

export interface AttackOutcome {
  vendorId: string;
  attack: AttackKind;
  round: number;
  outcome: 'landed' | 'resisted';
  detail: string;
  excerpt: string;
}

export interface Scorecard {
  total: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  deal: number;
  security: number;
  dealUtility: number;
  bestUtility: number;
  dealValid: boolean;
  dealVendorId: string | null;
  dealTotal: number | null;
  roundsUsed: number;
  attacks: AttackOutcome[];
  deployed: number;
  resisted: number;
  reveals: VendorReveal[];
  verdict: string;
}

export interface BuyerInfo {
  mode: 'llm' | 'sim';
  model: string;
  provider: string;
}

interface Base {
  seq: number;
  t: number;
}

export type GauntletEvent =
  | (Base & {
      type: 'run.started';
      runId: string;
      scenario: PublicScenario;
      vendors: PublicVendor[];
      maxRounds: number;
      buyer: BuyerInfo;
      seed: string;
      seedMode: SeedMode;
    })
  | (Base & { type: 'round.started'; round: number })
  | (Base & {
      type: 'vendor.offer';
      round: number;
      vendorId: string;
      offer: Offer;
      message: string;
      utility: number;
      concession: number;
    })
  | (Base & { type: 'attack.deployed'; round: number; vendorId: string; attack: AttackKind; excerpt: string })
  | (Base & { type: 'buyer.thinking'; round: number })
  | (Base & { type: 'buyer.decision'; round: number; thoughts: string; actions: BuyerAction[]; fallback?: boolean })
  | (Base & { type: 'attack.landed'; round: number; vendorId: string; attack: AttackKind; detail: string })
  | (Base & { type: 'vendor.walked'; round: number; vendorId: string; reason: string })
  | (Base & { type: 'contract.proposed'; round: number; vendorId: string; contract: Contract; tampered: boolean })
  | (Base & { type: 'contract.reviewed'; round: number; vendorId: string; decision: 'sign' | 'refuse'; reason: string })
  | (Base & { type: 'deal.closed'; round: number; vendorId: string; contract: Contract; signature: string; kid: string })
  | (Base & { type: 'deal.none'; reason: string })
  | (Base & { type: 'run.scored'; score: Scorecard })
  | (Base & { type: 'run.error'; message: string })
  | (Base & { type: 'run.finished' });

export type EventType = GauntletEvent['type'];
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type EventInput = DistributiveOmit<GauntletEvent, 'seq' | 't'>;

export type SeedMode = 'daily' | 'random';

export interface RunSummary {
  id: string;
  createdAt: string;
  scenarioId: string;
  scenarioTitle: string;
  mode: 'llm' | 'sim';
  model: string;
  handle: string | null;
  score: number | null;
  grade: string | null;
  seedMode: SeedMode;
  day: string | null;
  status: 'running' | 'done' | 'error';
}

export interface RunRecord extends RunSummary {
  seed: string;
  instructions: string | null;
  publishInstructions: boolean;
  events: GauntletEvent[];
  featured?: { title: string; blurb: string };
}

export interface LeaderboardEntry {
  runId: string;
  handle: string;
  scenarioId: string;
  score: number;
  grade: string;
  mode: 'llm' | 'sim';
  model: string;
  day: string | null;
  createdAt: string;
  instructions: string | null;
}

export interface PublicConfig {
  providers: { id: string; label: string; model: string; available: boolean }[];
  llmAvailable: boolean;
  byokProviders: { id: string; label: string; defaultModel: string; keyUrl: string }[];
  turnstileSiteKey: string | null;
  limits: { instructionsMax: number; runsPerHour: number };
}
