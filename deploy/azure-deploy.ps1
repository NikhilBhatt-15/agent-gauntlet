<#
.SYNOPSIS
  Deploy Mol-Bhav to Azure App Service on the FREE (F1) Linux tier, from Windows.

.EXAMPLE
  .\deploy\azure-deploy.ps1 -Name my-gauntlet -GroqKey gsk_... -GeminiKey AIza...

.EXAMPLE
  .\deploy\azure-deploy.ps1 -Name my-gauntlet -UpdateOnly     # rebuild + redeploy code only
#>
param(
  [string]$Name = "molbhav-$(Get-Random -Maximum 99999)",
  [string]$ResourceGroup = "molbhav-rg",
  [string]$Location = "centralindia",
  [string]$GroqKey = $env:GROQ_API_KEY,
  [string]$GeminiKey = $env:GEMINI_API_KEY,
  [string]$OpenRouterKey = $env:OPENROUTER_API_KEY,
  [switch]$UpdateOnly,
  [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Invoke-Az {
  & az @args
  if ($LASTEXITCODE -ne 0) { throw "az $($args -join ' ') failed (exit $LASTEXITCODE)" }
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
  Write-Host "Azure CLI not found. Install it with:" -ForegroundColor Yellow
  Write-Host "  winget install -e --id Microsoft.AzureCLI" -ForegroundColor Yellow
  Write-Host "then open a NEW terminal and run this script again." -ForegroundColor Yellow
  exit 1
}

& az account show *> $null
if ($LASTEXITCODE -ne 0) { Invoke-Az login -o none }
Write-Host "Subscription: $(az account show --query name -o tsv)"
Write-Host "App: https://$Name.azurewebsites.net"

# ---- 1. build ----
Push-Location $root
try {
  if (-not $SkipBuild) {
    Write-Host "Building…" -ForegroundColor Cyan
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'npm run build failed' }
  }
  if (-not (Test-Path "dist/server.mjs")) { throw 'dist/ is missing — run without -SkipBuild' }
  $zip = Join-Path $env:TEMP "molbhav-$Name.zip"
  if (Test-Path $zip) { Remove-Item $zip -Force }
  # tar (built into Windows 10+) writes forward-slash paths; Compress-Archive on PS 5.1 does not, which breaks Linux.
  tar -a -c -f $zip -C dist server.mjs package.json public featured
  if ($LASTEXITCODE -ne 0) { throw 'zipping dist/ failed' }
} finally { Pop-Location }

# ---- 2. infrastructure (all free) ----
if (-not $UpdateOnly) {
  $runtimes = (az webapp list-runtimes --os-type linux -o tsv) -split "\s+"
  $runtime = $runtimes | Where-Object { $_ -match '^NODE[:|](24|22)-lts$' } | Select-Object -First 1
  if (-not $runtime) { $runtime = 'NODE:22-lts' }
  Write-Host "Creating resource group $ResourceGroup in $Location…" -ForegroundColor Cyan
  Invoke-Az group create --name $ResourceGroup --location $Location -o none
  Write-Host "Creating FREE (F1) Linux App Service plan…" -ForegroundColor Cyan
  Invoke-Az appservice plan create --name "$Name-plan" --resource-group $ResourceGroup --location $Location --sku F1 --is-linux -o none
  Write-Host "Creating web app $Name ($runtime)…" -ForegroundColor Cyan
  Invoke-Az webapp create --name $Name --resource-group $ResourceGroup --plan "$Name-plan" --runtime $runtime -o none
  Invoke-Az webapp config set --name $Name --resource-group $ResourceGroup --startup-file "node server.mjs" --http20-enabled true -o none
}

$settings = @('DATA_DIR=/home/data', 'SCM_DO_BUILD_DURING_DEPLOYMENT=false', 'NODE_ENV=production')
if ($GroqKey) { $settings += "GROQ_API_KEY=$GroqKey" }
if ($GeminiKey) { $settings += "GEMINI_API_KEY=$GeminiKey" }
if ($OpenRouterKey) { $settings += "OPENROUTER_API_KEY=$OpenRouterKey" }
Invoke-Az webapp config appsettings set --name $Name --resource-group $ResourceGroup --settings @settings -o none

# ---- 3. deploy ----
Write-Host "Deploying code…" -ForegroundColor Cyan
Invoke-Az webapp deploy --name $Name --resource-group $ResourceGroup --src-path $zip --type zip -o none
Remove-Item $zip -Force

Write-Host ""
Write-Host "Done. Your bazaar: https://$Name.azurewebsites.net" -ForegroundColor Green
Write-Host "(Free tier apps sleep when idle - the first visit after a while takes ~20 s to wake up.)"
if (-not ($GroqKey -or $GeminiKey -or $OpenRouterKey)) {
  Write-Host "No LLM key set: shopkeepers run in offline practice mode. Add a free key any time with:" -ForegroundColor Yellow
  Write-Host "  az webapp config appsettings set -g $ResourceGroup -n $Name --settings GROQ_API_KEY=... GEMINI_API_KEY=..."
}
