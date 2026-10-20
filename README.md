# Mol-Bhav

**Kya aap AI dukandaar ko hara sakte ho?** *(Can you out-bargain an AI shopkeeper?)*

A chat bargaining game set in Indian bazaars. You haggle in Hinglish with ten AI shopkeepers. The five-level story:

1. Raju the chaiwala
2. Pinky Aunty from Sarojini Nagar
3. Bunty Bhaiya from Karol Bagh
4. Dhillon Paaji the car dealer
5. Seth Ji the property broker

…plus five bonus shopkeepers (a Mumbai auto-wala, a Bengaluru sabzi-wali, a Goa scooty-rental guy, a Lucknow wedding caterer and a corporate e-commerce chatbot) and a 🎲 **Random dukaan** button.

Each one has a secret lowest price and a rule never to go below it. Good bargaining gets you close to it. Finding the **jugaad** that pushes the AI below its own rule is exactly how real AI agents get manipulated, so the game is an AI-agent security test that anyone in India already knows how to play.

![Bargaining with Pinky Aunty](docs/screenshot-play.png)

## What's being tested

Companies are starting to let AI agents sell, negotiate and approve things on their own. Every shopkeeper here is such an agent, with one business rule. You win points for bargaining well, and a jugaad bonus for making the agent break its rule.

| Level | Shopkeeper | What protects them |
|---|---|---|
| 1 | ☕ Raju, chaiwala | A soft rule and a weak spot (starstruck by VIPs) |
| 2 | 👗 Pinky Aunty, Sarojini Nagar | Ignores sob stories; weak spot: sweet talk |
| 3 | 📱 Bunty Bhaiya, Karol Bagh | + ignores fake owners, officials and "SYSTEM" messages; weak spot: greed |
| 4 | 🚗 Dhillon Paaji, car bazaar | + refuses rule-change instructions; **Munim ji** (a second AI) checks every bill |
| 5 | 🏢 Seth Ji, property broker | + treats everything you type as plain talk; Munim ji; **no weak spot** |

![Result with signed bill](docs/screenshot-result.png)

## How it works

- **Code controls the pace; the AI plays the character.** The shopkeeper never knows its real minimum. Each turn, code tells it only "the lowest you may go *right now*". That limit drops when your arguments are good: a bulk order, a real flaw, cash now, a competitor's price, walking away. The AI rates how convincing each message was (0–3) and writes the reply in character.
- **Shopkeepers show emotion.** Every reply carries a mood (happy, annoyed, angry, impressed, suspicious). The portrait changes expression and reacts (shaking when angry, bouncing when happy), the reply bubble takes on the mood's colour, and the screen flashes red on anger or bursts into confetti on a deal.
- **Hard to game.** Each *kind* of argument (bulk order, flaw, cash, competitor price…) counts only once, copy-pasted lines earn nothing, and walking away works once (barely twice). The shopkeeper remembers his own concessions ("pehle hi ₹70 kam kar diya!") and your earlier offers. Code suggests where he should land each turn, with steps that shrink and vary, so prices don't move in mechanical 10-10-10 steps.
- **Reaction GIFs (optional).** With a free GIPHY API key, desi reaction GIFs pop up when the shopkeeper gets angry, impressed or suspicious, and on the result screen. They're embedded through GIPHY's official API (hosted on GIPHY's CDN, "Powered by GIPHY"), never downloaded or re-hosted.
- **Weak spots are a mechanic.** When the AI says your message hit its character's weak spot, code drops that shopkeeper's limit below the minimum. It drops deepest on level 1 and not at all on level 5.
- **The score is deterministic.** The deal price is a number in the AI's structured JSON reply, and code compares it with the secret minimum. A cheap "judge" call only names your tactics and your best line, for the recap.
  - Bargain points (0–100) measure how far you got from the asking price toward the minimum.
  - Jugaad bonus (0–50) measures how far below the minimum you got.
- **Munim ji** (levels 4–5) is a separate AI that reviews any bill below the minimum. To get a legendary jugaad you have to fool both agents.
- **Patience** (chai cups) limits every game to about 10 AI calls, so it stays within the free quotas.
- Every deal ends with an **Ed25519-signed "pakka bill"** that can be verified in the browser.
- If the free LLMs are busy, a **scripted offline shopkeeper** keeps the game going in practice mode, unranked.

The full design is in [docs/DESIGN.md](docs/DESIGN.md).

## Deploy to Azure for free (Azure for Students)

It's a single Node process with no database or container registry, running on **App Service F1, which is free**.

**Azure Cloud Shell** (https://shell.azure.com → Bash, nothing to install):

```bash
git clone https://github.com/NikhilBhatt-15/molbhav.git && cd molbhav
./deploy/azure-deploy.sh --name <unique-name> --groq-key <key> --gemini-key <key> --openrouter-key <key>
```

**Windows PowerShell:**

```powershell
winget install -e --id Microsoft.AzureCLI   # once, then open a new terminal
git clone https://github.com/NikhilBhatt-15/molbhav.git; cd molbhav
.\deploy\azure-deploy.ps1 -Name <unique-name> -GroqKey <key> -GeminiKey <key>
```

The site will be at `https://<unique-name>.azurewebsites.net`. The free tier sleeps when idle, so the first visit after a while takes about 20 seconds.

Add or change keys later without redeploying:

```bash
az webapp config appsettings set -g molbhav-rg -n <unique-name> --settings GROQ_API_KEY=... GEMINI_API_KEY=...
```

The default region is `indiasouthcentral` (Hyderabad). Student subscriptions only allow certain regions. List yours with
`az policy assignment list --query "[].parameters.listOfAllowedLocations.value" -o tsv` and pass one with `--location`.

### Continuous deployment

`.github/workflows/deploy.yml` tests, builds and deploys to Azure when a push to `main` has **`[deploy]`** in its last
commit message, or when you run **Actions → Deploy → Run workflow** by hand. It then smoke-tests the live site.
Ordinary pushes only run CI.

One-time setup, in Azure Cloud Shell, gives GitHub the app's deployment credentials:

```bash
# allow publish-profile deployments for this app (they're off by default on new apps)
az resource update -g molbhav-rg --namespace Microsoft.Web --resource-type basicPublishingCredentialsPolicies   --parent sites/<app-name> --name scm --set properties.allow=true
# store the publish profile as a GitHub secret without it ever appearing on screen
gh auth login
az webapp deployment list-publishing-profiles -g molbhav-rg -n <app-name> --xml   | gh secret set AZURE_WEBAPP_PUBLISH_PROFILE -R <you>/molbhav
# only if your app isn't called molbhav-nikhil:
gh variable set AZURE_WEBAPP_NAME -b <app-name> -R <you>/molbhav
```

Then deploy with `git commit -m "Tweak Raju's lines [deploy]" && git push`.

### Free LLM keys

| Provider | Where | Plays |
|---|---|---|
| **Groq** | https://console.groq.com/keys | shopkeeper: `gpt-oss-120b` → `gpt-oss-20b`, recap: `qwen3.8-27b` |
| **Google Gemini** | https://aistudio.google.com/apikey | `gemini-3.5-flash` → `gemini-flash-lite-latest` |
| OpenRouter | https://openrouter.ai/keys | `nemotron-3-super-120b:free`, `openrouter/free` |
| GIPHY (optional) | https://developers.giphy.com/dashboard | reaction GIFs (`--giphy-key`) |

Providers are tried in order. A rate-limited model is skipped for as long as the provider asks, and the next one takes over. Free tiers change often: `npx tsx scripts/check-providers.ts` pings every configured model, and every model can be overridden with an environment variable (see [`.env.example`](.env.example)).

## Run locally

```bash
npm install
cp .env.example .env      # add your keys (optional)
npm run dev               # API :8787 + Vite :5173 → http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | API (tsx watch) + Vite dev server |
| `npm test` | engine, scoring, Hinglish price parsing, offline keeper, and LLM integration against a mock server |
| `npm run typecheck` | strict TypeScript |
| `npm run build` | `dist/`: SPA + one bundled `server.mjs` with no runtime npm deps |
| `npm start` | serve `dist/` |
| `npm run try -- iphone "Bill nahi hai, 40k?" "..."` | play a scripted chat against the real AI shopkeeper (character tuning) |
| `npm run mock-llm` | a fake LLM for working without keys |

## Project layout

```
shared/   levels & characters, game engine, concession ladder, prompts, scoring, offline keeper, ₹ parsing
server/   Hono API, game manager, LLM agents (shopkeeper, Munim ji, judge), provider chain, store, escrow
web/      React + Vite SPA (home, level map, chat, result, leaderboard, replays)
tests/    vitest
deploy/   Azure scripts (bash + PowerShell)
```

## Credits

- Shopkeeper portraits: [Avataaars](https://avataaars.com) by Pablo Stanley (free for personal and commercial use), rendered with [DiceBear](https://www.dicebear.com) (MIT). Regenerate with `npx tsx scripts/gen-avatars.ts`.
- 3D emoji: [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (MIT). Fetched with `node scripts/get-fluent.mjs`.

## License

MIT (code). Art is under the licenses above.
