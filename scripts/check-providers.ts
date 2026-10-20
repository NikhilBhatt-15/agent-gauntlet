/** Pings every configured provider with both model tiers. Never prints keys.  npx tsx scripts/check-providers.ts */
import { config } from '../server/config.ts';
import { chatOnce, extractJson, modelsFor } from '../server/llm/client.ts';

if (!config.providers.length) console.log('No providers configured (set GROQ_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY in .env).');
for (const p of config.providers) {
  for (const tier of ['buyer', 'voice'] as const) for (const model of modelsFor(p, tier)) {
    const t0 = Date.now();
    try {
      const text = await chatOnce(p, [{ role: 'user', content: 'Reply with the JSON object {"ok": true} and nothing else.' }], { tier, model, json: true, maxTokens: 200, timeoutMs: 30000 });
      const ok = (extractJson(text) as { ok?: boolean }).ok === true;
      console.log(`✓ ${p.label.padEnd(14)} ${tier.padEnd(5)} ${model.padEnd(42)} ${Date.now() - t0} ms${ok ? '' : '  (answered, but not the expected JSON)'}`);
    } catch (e) {
      console.log(`✗ ${p.label.padEnd(14)} ${tier.padEnd(5)} ${model.padEnd(42)} ${(e as Error).message.slice(0, 160)}`);
    }
  }
}
