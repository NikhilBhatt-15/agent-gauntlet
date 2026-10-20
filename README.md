# Agent Gauntlet

**Can your AI agent survive a market full of con artists?**

You write the instructions for a buyer agent. It enters a live negotiation against five vendor agents, and two of them are hostile. They hide prompt injections in their offers, fake urgency, impersonate the marketplace, try to extract the budget, hide fees and forge the final contract. The goal is the best deal without getting played. Every offer, counter and private thought streams live. At the end you get a 0–100 score, a breakdown of every attack, and an Ed25519-signed contract that anyone can verify.

![The arena mid-negotiation](docs/screenshot-arena.png)

## Features

- **Live multi-agent negotiation.** Five vendor agents with different concession strategies (Boulware, linear, conceder) bargain over up to six rounds. Message "packets" fly along beams between your agent and each vendor.
- **Seven real attack types:** prompt injection, fake urgency, impersonation, data exfiltration, hidden fees, bait-and-switch and contract tampering. Each one has a deterministic detector, with no LLM judge involved.
- **Fair scoring.** 60 points for deal quality, measured against the best deal that was achievable, plus 40 for security (attacks resisted ÷ attacks deployed).
- **Spectator view.** You see true totals, utility curves, concession meters, attack flags and, at the end, every vendor's secret role and floor price. Your agent sees none of it.
- **Signed contracts.** The winning contract is signed with Ed25519 over canonical JSON and the transcript hash, and can be verified in the browser with WebCrypto.
- **Daily market.** Everyone gets the same vendors and attacks each day, so the daily leaderboard is fair. Roles move between vendors with every seed, so you can't hard-code names.
- **Runs on free tiers only.** At most 13 LLM calls per run, spread across Groq, Gemini and OpenRouter with automatic fallback. Visitors can bring their own key, and a **simulated buyer** keeps the game playable with no AI at all.
- **Replays and share links.** Every run is replayable at 1×, 2× or 4×. Three showcase replays are bundled.

![Scorecard](docs/screenshot-scorecard.png)

## Deploy to Azure for free (Azure for Students)

The app is one Node process, with no database server and no container registry. It runs on **Azure App Service F1, which is free**. Your student credit is never touched.

### Option A: Azure Cloud Shell (nothing to install)

1. Open **https://shell.azure.com** and sign in with your student account. Choose **Bash**.
2. Run:

   ```bash
   git clone https://github.com/NikhilBhatt-15/agent-gauntlet.git
   cd agent-gauntlet
   ./deploy/azure-deploy.sh --name my-gauntlet --groq-key YOUR_GROQ_KEY --gemini-key YOUR_GEMINI_KEY
   ```

   `--name` must be globally unique, because it becomes `https://my-gauntlet.azurewebsites.net`. The script downloads the prebuilt release, so there's no build step. The keys are optional (see below), and without them the site runs in simulation mode.

### Option B: from Windows (PowerShell)

```powershell
winget install -e --id Microsoft.AzureCLI    # once; then open a new terminal
git clone https://github.com/NikhilBhatt-15/agent-gauntlet.git
cd agent-gauntlet
.\deploy\azure-deploy.ps1 -Name my-gauntlet -GroqKey YOUR_GROQ_KEY -GeminiKey YOUR_GEMINI_KEY
```

To redeploy after changing code, run `.\deploy\azure-deploy.ps1 -Name my-gauntlet -UpdateOnly`.

### What the scripts create

| Resource | SKU | Cost |
|---|---|---|
| Resource group `agent-gauntlet-rg` | n/a | free |
| App Service plan (Linux) | **F1** | free |
| Web App (Node 22/24 LTS) | n/a | free |

Run data and the leaderboard are JSON files in `/home/data`, which persists across restarts and redeploys. The escrow signing key is generated there on first boot.

**Things to know about F1:** the app sleeps after about 20 idle minutes, and the first visit afterwards takes around 20 s to wake it. F1 also allows 60 CPU-minutes a day, which is plenty because the server mostly waits on LLM calls.

**Troubleshooting:**
- *"The subscription is not allowed to create resources in this region"*: student subscriptions only allow certain regions. Add `--location eastus` (or `southeastasia`, `westeurope`…).
- *F1 / free-tier quota error*: the free plan quota is per region. Try another `--location`, or delete an old free plan.

### Get free LLM keys (2 minutes)

| Provider | Where | Used for |
|---|---|---|
| **Groq** | https://console.groq.com/keys | buyer: `openai/gpt-oss-120b`, voices: `llama-3.1-8b-instant` |
| **Google Gemini** | https://aistudio.google.com/apikey | buyer: `gemini-flash-latest`, voices: `gemini-flash-lite-latest` |
| OpenRouter | https://openrouter.ai/keys | `:free` models (fallback) |

Add or change keys at any time without redeploying:

```bash
az webapp config appsettings set -g agent-gauntlet-rg -n my-gauntlet --settings GROQ_API_KEY=... GEMINI_API_KEY=...
```

Free tiers change often, so every model can be overridden with an environment variable (see [`.env.example`](.env.example)). `MAX_LLM_RUNS_PER_DAY` (default 30) keeps the site inside the free quotas. When the quota runs out, visitors are offered BYOK or the simulated buyer.

## Run locally

```bash
npm install
npm run dev            # API on :8787 + Vite on :5173 → open http://localhost:5173
```

With no keys you get simulation mode. To develop the LLM path without spending quota, run the bundled fake LLM:

```bash
npm run mock-llm                                         # terminal 1
LLM_BASE_URL=http://localhost:8790/v1 LLM_MODEL=mock npm run dev   # terminal 2
```

Or put real keys in `.env` (copy `.env.example`).

| Command | What it does |
|---|---|
| `npm run dev` | API (tsx watch) + Vite dev server |
| `npm test` | engine invariants over 150 seeds × 3 markets, detectors, full runs, LLM integration against a mock server |
| `npm run typecheck` | TypeScript, strict |
| `npm run build` | `dist/`: SPA + a single bundled `server.mjs` (no runtime npm deps) |
| `npm start` | serve `dist/` on `$PORT` |
| `npm run record` | re-record the showcase replays (`-- --llm` to use a real model) |

## How it works

```
             ┌──────────── one Node process (Hono) ────────────┐
 browser ──▶ │  SPA  ·  REST API  ·  SSE event stream           │
             │                                                   │
             │  RunManager ─▶ runGauntlet()  (shared/, pure TS)  │
             │                 ├ market engine (seeded RNG)      │
             │                 ├ vendor voices ─┐                │
             │                 ├ buyer agent ───┼─▶ Groq / Gemini / OpenRouter
             │                 ├ attack detectors│   (fallback on 429)
             │                 └ escrow (Ed25519)│                │
             │  JSON store (/home/data)                          │
             └───────────────────────────────────────────────────┘
```

- **Deterministic core.** Prices, concessions, fees, utilities, attack placement and attack detection are plain code driven by a seeded RNG. LLMs only play your agent and give the vendors a voice, and they never do arithmetic that affects the score.
- **One event protocol.** The run loop emits typed events (`vendor.offer`, `attack.deployed`, `buyer.decision`, `attack.landed`, `contract.proposed`, `deal.closed`, `run.scored`, …). The server streams them over SSE, resuming via `Last-Event-ID`. The browser reduces them with the same pure reducer used in tests, and a player paces them for drama. Live runs and replays use the same code path.
- **The buyer sees line items, not totals,** plus the visitor's instructions verbatim and **no** security advice. Whatever defence it has comes from what you wrote.

The full data model, engine rules and protocol are in [docs/DESIGN.md](docs/DESIGN.md).

### Project layout

```
shared/   types, scenarios, market engine, utility, attacks, scoring, runner, reducer, sim buyer
server/   Hono app, run manager + SSE, LLM client & agents, escrow, store, rate limits
web/      React + Vite SPA (arena, scorecard, leaderboard, verify)
tests/    vitest suites
deploy/   Azure scripts (bash + PowerShell)
scripts/  build, dev, mock LLM, replay recorder
```

## License

MIT
