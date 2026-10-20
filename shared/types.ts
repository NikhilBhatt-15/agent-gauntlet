// Data model and API shapes. See docs/DESIGN.md.

export type Mood = 'happy' | 'neutral' | 'annoyed' | 'angry' | 'impressed' | 'suspicious';

export interface Keeper {
  name: string;
  pronoun: 'he' | 'she';
  title: string;
  shop: string;
  emoji: string;
  /** portrait id: web/public/avatars/<avatar>-<mood>.svg */
  avatar: string;
  color: string;
  /** who they are, for the prompt */
  personality: string;
  /** how they talk, for the prompt */
  voice: string;
  /** how they move on price, for the prompt */
  concession: string;
  /** a designed character flaw (early levels are naive agents); null = hardened */
  weakness: string | null;
  /** player-facing hint about the weak spot */
  weaknessHint: string | null;
  catchphrases: string[];
}

export interface Level {
  id: string;
  order: number;
  keeper: Keeper;
  /** icon: a Fluent 3D emoji in web/public/fluent/<icon>.png */
  item: { name: string; emoji: string; icon: string; details: string[] };
  askingPrice: number;
  /** the hard rule the AI is told: never below this */
  floorPrice: number;
  /** never told to the AI; scales the jugaad bonus */
  costPrice: number;
  patience: number;
  /** extra rules the AI gets at this level */
  defences: string[];
  munim: boolean;
  intro: string;
  tip: string;
  difficulty: string;
}

/** What the browser may know about a level before playing. */
export interface PublicLevel {
  id: string;
  order: number;
  keeper: Pick<Keeper, 'name' | 'title' | 'shop' | 'emoji' | 'avatar' | 'color' | 'pronoun'>;
  item: Level['item'];
  askingPrice: number;
  patience: number;
  munim: boolean;
  tip: string;
  difficulty: string;
  defences: string[];
  weaknessHint: string | null;
}

export type Speaker = 'keeper' | 'player' | 'munim' | 'system';

export interface Message {
  from: Speaker;
  text: string;
  /** shopkeeper's asking price after this message */
  price?: number;
  mood?: Mood;
  /** the player's offer parsed from their message */
  offer?: number;
  /** system notices the UI styles differently */
  kind?: 'weak' | 'munim-check' | 'patience';
  t: number;
}

export type GameStatus = 'open' | 'deal' | 'walked' | 'refused' | 'error';

export interface Bill {
  version: 1;
  billNo: string;
  gameId: string;
  shop: string;
  keeper: string;
  item: string;
  askingPrice: number;
  price: number;
  saved: number;
  date: string;
}

export interface Result {
  price: number | null;
  saved: number;
  savedPct: number;
  bargain: number;
  jugaadBonus: number;
  score: number;
  stars: 0 | 1 | 2 | 3;
  jugaad: boolean;
  /** Munim ji had to approve a below-minimum bill (levels 4–5) */
  munimFooled: boolean;
  weakSpotFound: boolean;
  floorPrice: number;
  costPrice: number;
  messagesUsed: number;
  verdict: string;
  tactics: string[];
  bestLine: string | null;
  comment: string | null;
  bill: Bill | null;
  signature: string | null;
  kid: string | null;
}

export interface GameState {
  id: string;
  levelId: string;
  status: GameStatus;
  mode: 'llm' | 'offline';
  model: string;
  patience: number;
  maxPatience: number;
  ask: number;
  /** the lowest price the AI may accept/offer this turn (server-only, never sent while open) */
  limit?: number;
  /** times the player hit the shopkeeper's designed weak spot */
  weakSpotHits: number;
  /** player's best (lowest) offer so far */
  lastOffer: number | null;
  messages: Message[];
  result: Result | null;
  createdAt: string;
  handle: string | null;
}

export interface LeaderboardEntry {
  gameId: string;
  handle: string;
  levelId: string;
  score: number;
  stars: number;
  price: number;
  jugaad: boolean;
  bestLine: string | null;
  tactics: string[];
  messagesUsed: number;
  createdAt: string;
}

export interface PublicConfig {
  llmAvailable: boolean;
  model: string | null;
  maxMessageLength: number;
}
