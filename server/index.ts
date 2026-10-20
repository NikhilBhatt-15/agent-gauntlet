import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { getScenario, publicScenario, SCENARIOS } from '../shared/scenarios.ts';
import { todayUtc } from '../shared/rng.ts';
import type { Contract, GauntletEvent, PublicConfig } from '../shared/types.ts';
import { config, PROVIDER_PRESETS, type ProviderSpec } from './config.ts';
import { createEscrow } from './escrow.ts';
import { ProviderChain } from './llm/client.ts';
import { DailyBudget, RateLimiter, Semaphore } from './limits.ts';
import { RunManager } from './runs.ts';
import { Store, summarize } from './store.ts';

const store = new Store(config.dataDir, config.maxStoredRuns);
const escrow = createEscrow(config.dataDir, config.escrowPrivateKey);
const chain = new ProviderChain(config.providers);
const gate = new Semaphore(config.maxConcurrentLlmRuns);
const budget = new DailyBudget(config.maxLlmRunsPerDay);
const limiter = new RateLimiter();
const runs = new RunManager(store, escrow, chain, gate, config.featuredDir);

const HOUR = 3600_000;

function clientIp(c: Context): string {
  if (config.trustProxy) {
    // App Service's front end sets X-Client-IP itself. Otherwise use the LAST X-Forwarded-For hop
    // (the one our proxy appended); earlier entries are client-supplied and spoofable.
    const raw = c.req.header('x-client-ip') ?? c.req.header('x-forwarded-for')?.split(',').pop();
    if (raw?.trim()) {
      const ip = raw.trim();
      // strip a trailing port ("1.2.3.4:5678"); keep IPv6 intact
      return ip.includes('.') ? ip.replace(/:\d+$/, '') : ip;
    }
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  if (!config.turnstileSecret) return true;
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: config.turnstileSecret, response: token, remoteip: ip }),
    });
    const data = (await res.json()) as { success?: boolean };
    return !!data.success;
  } catch {
    return false;
  }
}

const app = new Hono();

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  if (!c.req.path.startsWith('/api/')) {
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-src https://challenges.cloudflare.com; base-uri 'self'; form-action 'self'",
    );
  }
});
app.use('/api/*', bodyLimit({ maxSize: 32 * 1024, onError: (c) => c.json({ error: 'Request too large' }, 413) }));

app.get('/api/health', (c) =>
  c.json({ ok: true, providers: chain.status(), activeRuns: runs.activeCount, llmRunsLeftToday: budget.remaining() }),
);

app.get('/api/config', (c) => {
  const body: PublicConfig = {
    providers: chain.status().map((p) => ({ id: p.id, label: p.label, model: p.buyerModel, available: p.coolingDownForMs === 0 })),
    llmAvailable: chain.available && chain.anyReady && budget.remaining() > 0,
    byokProviders: Object.values(PROVIDER_PRESETS).map((p) => ({ id: p.id, label: p.label, defaultModel: p.buyerModel.split(',')[0], keyUrl: p.keyUrl })),
    turnstileSiteKey: config.turnstileSiteKey,
    limits: { instructionsMax: config.instructionsMax, runsPerHour: config.llmRunsPerHourPerIp },
  };
  return c.json(body);
});

app.get('/api/scenarios', (c) => c.json(SCENARIOS.map(publicScenario)));

const StartSchema = z.object({
  scenarioId: z.string(),
  instructions: z.string().max(config.instructionsMax),
  seedMode: z.enum(['daily', 'random']).default('daily'),
  mode: z.enum(['auto', 'llm', 'sim']).default('auto'),
  publishInstructions: z.boolean().default(false),
  turnstileToken: z.string().optional(),
  byok: z
    .object({
      provider: z.enum(['groq', 'gemini', 'openrouter']),
      apiKey: z.string().min(10).max(300),
      model: z.string().max(120).optional(),
    })
    .optional(),
});

app.post('/api/runs', async (c) => {
  const parsed = StartSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid request', issues: parsed.error.issues.slice(0, 3) }, 400);
  const body = parsed.data;
  const scenario = getScenario(body.scenarioId);
  if (!scenario) return c.json({ error: 'Unknown scenario' }, 400);
  const ip = clientIp(c);
  if (!(await verifyTurnstile(body.turnstileToken, ip))) return c.json({ error: 'Human check failed — please retry.' }, 403);

  let byok: ProviderSpec | null = null;
  if (body.byok) {
    const preset = PROVIDER_PRESETS[body.byok.provider];
    const model = body.byok.model?.trim() || preset.buyerModel;
    byok = { ...preset, apiKey: body.byok.apiKey.trim(), buyerModel: model, voiceModel: body.byok.model?.trim() || preset.voiceModel };
  }

  let mode: 'llm' | 'sim';
  if (body.mode === 'sim') mode = 'sim';
  else if (byok) mode = 'llm';
  else if (chain.available && chain.anyReady && budget.remaining() > 0) mode = 'llm';
  else if (body.mode === 'llm')
    return c.json(
      {
        error: !chain.available
          ? 'No AI provider is configured on this server. Bring your own key or play in simulation mode.'
          : !chain.anyReady
            ? 'The free AI providers are rate-limited right now. Try again in a minute, bring your own key, or play in simulation mode.'
            : "Today's free AI runs are used up. Bring your own free key, or play in simulation mode.",
      },
      429,
    );
  else mode = 'sim';

  const [bucket, limit] = byok ? ['byok', config.byokRunsPerHourPerIp] : mode === 'llm' ? ['llm', config.llmRunsPerHourPerIp] : ['sim', config.simRunsPerHourPerIp];
  const wait = limiter.take(bucket, ip, limit, HOUR);
  if (wait) return c.json({ error: `You're going fast! Try again in ${Math.ceil(wait / 60)} min${byok || mode === 'sim' ? '' : ', or bring your own key'}.` }, 429);

  const serverFunded = mode === 'llm' && !byok;
  if (serverFunded && !budget.take()) return c.json({ error: "Today's free AI runs are used up. Bring your own key or play in simulation mode." }, 429);

  const { runId, claimToken } = runs.start({
    scenario,
    instructions: body.instructions,
    seedMode: body.seedMode,
    mode,
    byok,
    publishInstructions: body.publishInstructions,
    vendorVoice: config.vendorVoice,
    onSettled: (ok) => {
      if (serverFunded && !ok) budget.refund();
    },
  });
  return c.json({ runId, claimToken, mode });
});

app.get('/api/runs/:id', (c) => {
  const r = runs.getPublic(c.req.param('id'));
  return r ? c.json(r) : c.json({ error: 'Run not found' }, 404);
});

app.get('/api/runs/:id/events', (c) => {
  const id = c.req.param('id');
  const last = Number(c.req.header('last-event-id') ?? c.req.query('after') ?? -1);
  const afterSeq = Number.isFinite(last) ? last : -1;
  if (!runs.getStored(id)) return c.json({ error: 'Run not found' }, 404);
  c.header('X-Accel-Buffering', 'no');
  c.header('Cache-Control', 'no-cache, no-transform');
  return streamSSE(c, async (stream) => {
    const queue: GauntletEvent[] = [];
    let wake: (() => void) | null = null;
    let finished = false;
    const unsubscribe = runs.subscribe(id, afterSeq, (e) => {
      queue.push(e);
      wake?.();
    });
    stream.onAbort(() => {
      finished = true;
      wake?.();
    });
    const heartbeat = setInterval(() => {
      void stream.write(': ping\n\n');
    }, 15_000);
    try {
      while (!finished) {
        while (queue.length) {
          const e = queue.shift()!;
          await stream.writeSSE({ id: String(e.seq), event: 'gauntlet', data: JSON.stringify(e) });
          if (e.type === 'run.finished') finished = true;
        }
        if (finished) break;
        await new Promise<void>((r) => {
          wake = r;
          setTimeout(r, 5000);
        });
        wake = null;
      }
    } finally {
      clearInterval(heartbeat);
      unsubscribe?.();
    }
  });
});

const ClaimSchema = z.object({
  claimToken: z.string().min(10).max(100),
  handle: z
    .string()
    .transform((s) => s.replace(/[^\p{L}\p{N} _.\-]/gu, '').trim())
    .pipe(z.string().min(2).max(24)),
});

app.post('/api/runs/:id/claim', async (c) => {
  const parsed = ClaimSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Pick a name of 2–24 letters or numbers.' }, 400);
  if (limiter.take('claim', clientIp(c), 30, HOUR)) return c.json({ error: 'Too many submissions' }, 429);
  const res = runs.claim(c.req.param('id'), parsed.data.claimToken, parsed.data.handle);
  return res.ok ? c.json(res.entry) : c.json({ error: res.error }, 400);
});

app.get('/api/leaderboard', (c) => {
  const scenarioId = c.req.query('scenario') || undefined;
  const mode = c.req.query('mode') === 'sim' ? 'sim' : 'llm';
  const period = c.req.query('period') === 'all' ? 'all' : 'today';
  return c.json({ day: todayUtc(), entries: store.leaderboard({ scenarioId, mode, day: period === 'today' ? todayUtc() : null }) });
});

app.get('/api/featured', (c) =>
  c.json(
    runs.featuredList().map((r) => {
      const scored = r.events.find((e): e is Extract<GauntletEvent, { type: 'run.scored' }> => e.type === 'run.scored');
      return { ...summarize(r), featured: r.featured, verdict: scored?.score.verdict ?? null };
    }),
  ),
);

app.get('/api/recent', (c) => c.json(store.recent(12)));

app.get('/api/escrow/key', (c) => c.json({ kid: escrow.kid, jwk: escrow.jwk, alg: 'Ed25519' }));

app.post('/api/escrow/verify', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { contract?: Contract; signature?: string } | null;
  if (!body?.contract || typeof body.signature !== 'string') return c.json({ error: 'Send {contract, signature}' }, 400);
  return c.json({ valid: escrow.verify(body.contract, body.signature), kid: escrow.kid });
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
  app.use('*', serveStatic({ root }));
  const indexHtml = fs.readFileSync(path.join(config.publicDir, 'index.html'), 'utf8');
  app.get('*', (c) => {
    c.header('Cache-Control', 'no-cache');
    return c.html(indexHtml);
  });
}

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  const providers = config.providers.map((p) => `${p.label} (${p.buyerModel})`).join(', ') || 'none — simulation mode only';
  console.log(`Agent Gauntlet listening on http://localhost:${info.port}`);
  console.log(`  data: ${config.dataDir}`);
  console.log(`  LLM providers: ${providers}`);
  console.log(`  featured replays: ${runs.featuredList().length}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    runs.shutdown();
    server.close();
    setTimeout(() => process.exit(0), 500).unref();
  });
}

export { app };
