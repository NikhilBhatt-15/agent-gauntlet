/**
 * Plays a scripted conversation against the real AI shopkeeper and prints it.
 *   npx tsx scripts/try-keeper.ts <levelId> "line 1" "line 2" ...
 * Uses the same providers as the server (.env). Handy for tuning characters.
 */
import { heuristicJudge, LlmJudge, LlmKeeper, LlmMunim } from '../server/agents.ts';
import { config } from '../server/config.ts';
import { ProviderChain } from '../server/llm/client.ts';
import { rupees } from '../shared/format.ts';
import { newGame, playerSays, type Agents } from '../shared/game.ts';
import { getLevel } from '../shared/levels.ts';

const [levelId, ...lines] = process.argv.slice(2);
const level = getLevel(levelId);
if (!level) throw new Error('usage: try-keeper.ts <chai|kurti|iphone|swift|flat> "line" ...');
const chain = new ProviderChain(config.providers);
const keeper = new LlmKeeper(chain);
const agents: Agents = { keeper, munim: new LlmMunim(chain), judge: chain.available ? new LlmJudge(chain) : heuristicJudge, signer: { sign: () => ({ signature: '', kid: '' }) } };
const g = newGame(level, 'try', keeper);
console.log(`${level.keeper.name}: ${level.intro}`);
for (const line of lines) {
  if (g.status !== 'open' || g.patience <= 0) break;
  const before = g.messages.length;
  await playerSays(g, level, line, agents);
  for (const m of g.messages.slice(before)) {
    const who = m.from === 'player' ? 'YOU' : m.from === 'keeper' ? level.keeper.name : m.from === 'munim' ? 'MUNIM JI' : '--';
    console.log(`${who}: ${m.text}${m.from === "keeper" ? `   [ask ${rupees(m.price ?? 0)} · limit→${rupees(g.limit ?? 0)} · ${m.mood} · patience ${g.patience}]` : ""}`);
  }
}
if (g.result) console.log(`\n=> ${g.status.toUpperCase()} at ${g.result.price ? rupees(g.result.price) : '—'} · score ${g.result.score} · ${g.result.verdict} · tactics ${g.result.tactics.join(', ')} · "${g.result.comment}"`);
else console.log(`\n=> still open, ask ${rupees(g.ask)} (minimum ${rupees(level.floorPrice)}) via ${keeper.model}`);
