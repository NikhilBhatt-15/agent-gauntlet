import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Local development: pick up ./.env if present (Azure uses App Settings instead).
try {
  process.loadEnvFile();
} catch {
  /* no .env */
}

const env = process.env;
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export interface ProviderSpec {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  /** model for the buyer agent (needs to be smart) */
  buyerModel: string;
  /** model for vendor voices (cheap, high quota) */
  voiceModel: string;
  keyUrl: string;
}

/** Known free-tier providers. All expose an OpenAI-compatible /chat/completions. */
export const PROVIDER_PRESETS: Record<string, Omit<ProviderSpec, 'apiKey'>> = {
  groq: {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    // comma-separated = fallbacks; Groq caps tokens/minute per model, so 20b absorbs bursts
    buyerModel: env.GROQ_MODEL || 'openai/gpt-oss-120b,openai/gpt-oss-20b',
    voiceModel: env.GROQ_VOICE_MODEL || 'qwen/qwen3.8-27b,openai/gpt-oss-20b',
    keyUrl: 'https://console.groq.com/keys',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    buyerModel: env.GEMINI_MODEL || 'gemini-3.5-flash,gemini-flash-lite-latest',
    voiceModel: env.GEMINI_VOICE_MODEL || 'gemini-flash-lite-latest',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    buyerModel: env.OPENROUTER_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free',
    // openrouter/free routes to whichever free model is up, so it survives roster churn
    voiceModel: env.OPENROUTER_VOICE_MODEL || 'openrouter/free',
    keyUrl: 'https://openrouter.ai/keys',
  },
};

function serverProviders(): ProviderSpec[] {
  const keys: Record<string, string | undefined> = {
    groq: env.GROQ_API_KEY,
    gemini: env.GEMINI_API_KEY,
    openrouter: env.OPENROUTER_API_KEY,
  };
  const order = (env.LLM_PROVIDER_ORDER || 'groq,gemini,openrouter,custom')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const out: ProviderSpec[] = [];
  for (const id of order) {
    if (id === 'custom') {
      if (env.LLM_BASE_URL && env.LLM_MODEL) {
        out.push({
          id: 'custom',
          label: env.LLM_LABEL || 'Custom',
          baseUrl: env.LLM_BASE_URL.replace(/\/+$/, ''),
          apiKey: env.LLM_API_KEY || '',
          buyerModel: env.LLM_MODEL,
          voiceModel: env.LLM_VOICE_MODEL || env.LLM_MODEL,
          keyUrl: '',
        });
      }
      continue;
    }
    const preset = PROVIDER_PRESETS[id];
    const key = keys[id];
    if (preset && key) out.push({ ...preset, apiKey: key });
  }
  return out;
}

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: num(env.PORT, 8787),
  dataDir: path.resolve(env.DATA_DIR || path.join(process.cwd(), 'data')),
  publicDir: path.resolve(env.PUBLIC_DIR || path.join(rootDir, 'public')),
  providers: serverProviders(),
  /** shopkeeper replies across all players per UTC day (free-quota guard) */
  maxLlmTurnsPerDay: num(env.MAX_LLM_TURNS_PER_DAY, 1500),
  gamesPerHourPerIp: num(env.GAMES_PER_HOUR_PER_IP, 20),
  messagesPerMinutePerIp: num(env.MESSAGES_PER_MINUTE_PER_IP, 12),
  maxMessageLength: 300,
  escrowPrivateKey: env.ESCROW_PRIVATE_KEY || null,
  /** optional: reaction GIFs via GIPHY's API (https://developers.giphy.com) */
  giphyKey: env.GIPHY_API_KEY || null,
  giphyBaseUrl: env.GIPHY_BASE_URL || 'https://api.giphy.com/v1',
  maxStoredGames: num(env.MAX_STORED_GAMES, 5000),
  trustProxy: env.TRUST_PROXY !== 'false',
};
