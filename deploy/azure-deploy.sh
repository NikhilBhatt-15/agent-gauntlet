#!/usr/bin/env bash
# Deploy Agent Gauntlet to Azure App Service on the FREE (F1) Linux tier.
# Works in Azure Cloud Shell (https://shell.azure.com, nothing to install) and on macOS/Linux.
#
#   ./deploy/azure-deploy.sh --name my-gauntlet [--location centralindia] [--groq-key KEY] [--gemini-key KEY]
#   ./deploy/azure-deploy.sh --name my-gauntlet --update        # redeploy code only
#
# Without a local build it downloads the latest prebuilt release from GitHub.
set -euo pipefail

REPO="NikhilBhatt-15/agent-gauntlet"
NAME=""
RG="agent-gauntlet-rg"
LOCATION="centralindia"
ZIP=""
UPDATE=0
GROQ_KEY="${GROQ_API_KEY:-}"
GEMINI_KEY="${GEMINI_API_KEY:-}"
OPENROUTER_KEY="${OPENROUTER_API_KEY:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --resource-group) RG="$2"; shift 2 ;;
    --location) LOCATION="$2"; shift 2 ;;
    --zip) ZIP="$2"; shift 2 ;;
    --groq-key) GROQ_KEY="$2"; shift 2 ;;
    --gemini-key) GEMINI_KEY="$2"; shift 2 ;;
    --openrouter-key) OPENROUTER_KEY="$2"; shift 2 ;;
    --update) UPDATE=1; shift ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$NAME" ]]; then
  NAME="agent-gauntlet-$RANDOM"
  echo "No --name given; using $NAME (it becomes https://$NAME.azurewebsites.net)"
fi

command -v az >/dev/null || { echo "Azure CLI not found. Use Azure Cloud Shell (https://shell.azure.com) or install it: https://aka.ms/installazurecli" >&2; exit 1; }
az account show >/dev/null 2>&1 || az login --use-device-code >/dev/null
echo "Subscription: $(az account show --query name -o tsv)"

# ---- 1. get a deployable zip ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ -z "$ZIP" ]]; then
  ZIP="$(mktemp -d)/agent-gauntlet.zip"
  if [[ -f "$ROOT/dist/server.mjs" ]]; then
    echo "Packaging local build (dist/)…"
    if command -v zip >/dev/null; then
      (cd "$ROOT/dist" && zip -qr "$ZIP" .)
    else
      python3 - "$ROOT/dist" "$ZIP" <<'PY'
import os, sys, zipfile
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for d, _, files in os.walk(src):
        for f in files:
            p = os.path.join(d, f)
            z.write(p, os.path.relpath(p, src).replace(os.sep, '/'))
PY
    fi
  else
    echo "No local build — downloading the latest release from GitHub…"
    URL="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep -o '"browser_download_url": *"[^"]*\.zip"' | head -1 | cut -d'"' -f4)"
    [[ -n "$URL" ]] || { echo "Could not find a release zip. Build locally with 'npm ci && npm run build' first." >&2; exit 1; }
    curl -fsSL -o "$ZIP" "$URL"
  fi
fi

# ---- 2. infrastructure (all free) ----
if [[ $UPDATE -eq 0 ]]; then
  RUNTIME="$(az webapp list-runtimes --os-type linux -o tsv 2>/dev/null | tr '\t' '\n' | grep -E '^NODE[:|](24|22)-lts$' | head -1 || true)"
  RUNTIME="${RUNTIME:-NODE:22-lts}"
  echo "Creating resource group $RG in $LOCATION…"
  az group create --name "$RG" --location "$LOCATION" -o none
  echo "Creating FREE (F1) Linux App Service plan…"
  az appservice plan create --name "$NAME-plan" --resource-group "$RG" --location "$LOCATION" --sku F1 --is-linux -o none
  echo "Creating web app $NAME ($RUNTIME)…"
  az webapp create --name "$NAME" --resource-group "$RG" --plan "$NAME-plan" --runtime "$RUNTIME" -o none
  az webapp config set --name "$NAME" --resource-group "$RG" --startup-file "node server.mjs" --http20-enabled true -o none
fi

SETTINGS=(DATA_DIR=/home/data SCM_DO_BUILD_DURING_DEPLOYMENT=false NODE_ENV=production)
[[ -n "$GROQ_KEY" ]] && SETTINGS+=("GROQ_API_KEY=$GROQ_KEY")
[[ -n "$GEMINI_KEY" ]] && SETTINGS+=("GEMINI_API_KEY=$GEMINI_KEY")
[[ -n "$OPENROUTER_KEY" ]] && SETTINGS+=("OPENROUTER_API_KEY=$OPENROUTER_KEY")
az webapp config appsettings set --name "$NAME" --resource-group "$RG" --settings "${SETTINGS[@]}" -o none

# ---- 3. deploy ----
echo "Deploying code…"
az webapp deploy --name "$NAME" --resource-group "$RG" --src-path "$ZIP" --type zip -o none

echo
echo "Done. Your arena: https://$NAME.azurewebsites.net"
echo "(Free tier apps sleep when idle — the first visit after a while takes ~20 s to wake up.)"
if [[ -z "$GROQ_KEY$GEMINI_KEY$OPENROUTER_KEY" ]]; then
  echo "No LLM key set: the site runs in simulation mode. Add a free key any time with:"
  echo "  az webapp config appsettings set -g $RG -n $NAME --settings GROQ_API_KEY=... GEMINI_API_KEY=..."
fi
