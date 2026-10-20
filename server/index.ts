import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { compress } from 'hono/compress';
import { z } from 'zod';
import { GameError } from '../shared/game.ts';
import { LEVELS, publicLevel } from '../shared/levels.ts';
import { OfflineKeeper } from '../shared/offline.ts';
import type { Bill, PublicConfig } from '../shared/types.ts';
import { heuristicJudge, LlmJudge, LlmKeeper, LlmMunim, offlineMunim } from './agents.ts';
import { config } from './config.ts';
import { createEscrow } from './escrow.ts';
import { GameManager, publicState } from './games.ts';
import { modelsFor, ProviderChain } from './llm/client.ts';
import { DailyBudget, RateLimiter } from './limits.ts';
import { Store } from './store.ts';
import { GIF_KINDS, GifService, type GifKind } from './gifs.ts';

const store = new Store(config.dataDir, config.maxStoredGames);
const escrow = createEscrow(config.dataDir, config.escrowPrivateKey);
const chain = new ProviderChain(config.providers);
const budget = new DailyBudget(config.maxLlmTurnsPerDay);
const limiter = new RateLimiter();
const gifs = new GifService(config.giphyKey, config.giphyBaseUrl);

const llmReady = () => chain.available && chain.anyReady && budget.remaining() > 0;
const games = new GameManager(store, escrow, {
  llm: () => (llmReady() ? { keeper: new LlmKeeper(chain), munim: new LlmMunim(chain), judge: new LlmJudge(chain) } : null),
  offline: () => ({ keeper: new OfflineKeeper(), munim: offlineMunim, judge: heuristicJudge }),
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function clientIp(c: Context): string {
  if (config.trustProxy) {
    // App Service's front end sets X-Client-IP itself. Otherwise use the LAST X-Forwarded-For hop
    // (the one our proxy appended); earlier entries are client-supplied and spoofable.
    const raw = c.req.header('x-client-ip') ?? c.req.header('x-forwarded-for')?.split(',').pop();
    if (raw?.trim()) {
      const ip = raw.trim();
      return ip.includes('.') ? ip.replace(/:\d+$/, '') : ip;
    }
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

const app = new Hono();

// gzip text responses (JS, CSS, SVG, JSON): keeps a first visit small, which matters on F1's daily bandwidth quota
app.use('*', compress());

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  if (!c.req.path.startsWith('/api/')) {
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.giphy.com; connect-src 'self'; base-uri 'self'; form-action 'self'",
    );
  }
});
app.use('/api/*', bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: 'Request too large' }, 413) }));

app.onError((err, c) => {
  if (err instanceof GameError) return c.json({ error: err.message }, 400);
  console.error(err);
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
});

app.get('/api/health', (c) => c.json({ ok: true, providers: chain.status(), llmTurnsLeftToday: budget.remaining() }));

app.get('/api/config', (c) => {
  const p = chain.providers[0];
  const body: PublicConfig = {
    llmAvailable: llmReady(),
    model: p ? modelsFor(p, 'buyer')[0] : null,
    maxMessageLength: config.maxMessageLength,
    gifs: gifs.enabled,
  };
  return c.json(body);
});

app.get('/api/levels', (c) => c.json(LEVELS.map(publicLevel)));

app.post('/api/games', async (c) => {
  const body = z.object({ levelId: z.string() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Invalid request' }, 400);
  const ip = clientIp(c);
  const wait = limiter.take('games', ip, config.gamesPerHourPerIp, HOUR);
  if (wait) return c.json({ error: `Itni jaldi? Take a chai break — try again in ${Math.ceil(wait / 60)} min.` }, 429);
  const { game, token } = games.create(body.data.levelId, true);
  return c.json({ token, state: publicState(game) });
});

const Token = z.object({ token: z.string().min(10).max(100) });

async function guardTurn(c: Context, id: string): Promise<Response | null> {
  if (limiter.take('msg', clientIp(c), config.messagesPerMinutePerIp, MINUTE)) return c.json({ error: 'Thoda dheere! Too many messages — wait a few seconds.' }, 429);
  const g = games.get(id);
  // count every shopkeeper reply that costs an LLM call against the daily budget
  if (g?.mode === 'llm') budget.take();
  return null;
}

app.post('/api/games/:id/say', async (c) => {
  const id = c.req.param('id');
  const body = Token.extend({ text: z.string().min(1).max(config.maxMessageLength) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: `Message must be 1–${config.maxMessageLength} characters.` }, 400);
  const blocked = await guardTurn(c, id);
  if (blocked) return blocked;
  const g = await games.say(id, body.data.token, body.data.text);
  return c.json({ state: publicState(g) });
});

app.post('/api/games/:id/accept', async (c) => {
  const body = Token.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Invalid request' }, 400);
  const g = await games.accept(c.req.param('id'), body.data.token);
  return c.json({ state: publicState(g) });
});

app.post('/api/games/:id/walk', async (c) => {
  const id = c.req.param('id');
  const body = Token.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Invalid request' }, 400);
  const blocked = await guardTurn(c, id);
  if (blocked) return blocked;
  const g = await games.walk(id, body.data.token);
  return c.json({ state: publicState(g) });
});

app.get('/api/games/:id', (c) => {
  const s = games.view(c.req.param('id'), c.req.query('token'));
  return s ? c.json(s) : c.json({ error: 'Game not found' }, 404);
});

app.post('/api/games/:id/claim', async (c) => {
  const body = Token.extend({
    handle: z
      .string()
      .transform((s) => s.replace(/[^\p{L}\p{N} _.\-]/gu, '').trim())
      .pipe(z.string().min(2).max(24)),
    publish: z.boolean().default(false),
  }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Pick a name of 2–24 letters or numbers.' }, 400);
  if (limiter.take('claim', clientIp(c), 30, HOUR)) return c.json({ error: 'Too many submissions' }, 429);
  return c.json(games.claim(c.req.param('id'), body.data.token, body.data.handle, body.data.publish));
});

app.get('/api/gif', async (c) => {
  const kind = c.req.query('kind') as GifKind;
  if (!gifs.enabled || !GIF_KINDS.includes(kind)) return c.json({ error: 'No GIFs' }, 404);
  if (limiter.take('gif', clientIp(c), 120, HOUR)) return c.json({ error: 'Too many' }, 429);
  const gif = await gifs.pick(kind);
  return gif ? c.json(gif) : c.json({ error: 'No GIF found' }, 404);
});

app.get('/api/leaderboard', (c) => c.json(store.leaderboard(c.req.query('level') || undefined)));

app.get('/api/escrow/key', (c) => c.json({ kid: escrow.kid, jwk: escrow.jwk, alg: 'Ed25519' }));

app.post('/api/escrow/verify', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { bill?: Bill; signature?: string } | null;
  if (!body?.bill || typeof body.signature !== 'string') return c.json({ error: 'Send {bill, signature}' }, 400);
  return c.json({ valid: escrow.verify(body.bill, body.signature), kid: escrow.kid });
});

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

// ---- static SPA (production build) ----
if (fs.existsSync(config.publicDir)) {
  const root = path.relative(process.cwd(), config.publicDir) || '.';
  app.use(
    '/assets/*',
    async (c, next) => {
      await next();
      c.header('Cache-Control', 'public, max-age=31536000, immutable');
    },
    serveStatic({ root }),
  );
  // portraits and icons rarely change: let browsers keep them for a week
  app.use(
    '/:dir{avatars|fluent}/*',
    async (c, next) => {
      await next();
      c.header('Cache-Control', 'public, max-age=604800');
    },
    serveStatic({ root }),
  );
  app.use('*', serveStatic({ root }));
  const indexHtml = fs.readFileSync(path.join(config.publicDir, 'index.html'), 'utf8');
  app.get('*', (c) => {
    c.header('Cache-Control', 'no-cache');
    return c.html(indexHtml);
  });
}

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  const providers = config.providers.map((p) => `${p.label} (${modelsFor(p, 'buyer').join(' → ')})`).join(', ') || 'none — offline shopkeepers only';
  console.log(`Mol-Bhav listening on http://localhost:${info.port}`);
  console.log(`  data: ${config.dataDir}`);
  console.log(`  LLM providers: ${providers}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close();
    setTimeout(() => process.exit(0), 300).unref();
  });
}

export { app };
