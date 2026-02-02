<#
.SYNOPSIS
    Start the local development environment for Video Scavenger Hunt.

.DESCRIPTION
    This script starts all required services for local development:
    - Azurite (Azure Storage Emulator) in WSL
    - Azure Functions in WSL
    - Vite dev server

.PARAMETER SkipSeed
    Skip seeding the database with sample data.

.PARAMETER FunctionsPort
    Port for Azure Functions (default: 7072).

.EXAMPLE
    .\start-dev.ps1

.EXAMPLE
    .\start-dev.ps1 -SkipSeed
#>

param(
    [switch]$SkipSeed,
    [int]$FunctionsPort = 7072
)

$ErrorActionPreference = "Stop"

# Get the repo root path and convert to WSL path
$repoRoot = $PSScriptRoot
$wslRepoRoot = "/mnt/" + ($repoRoot -replace '\\', '/' -replace '^([A-Za-z]):', { $_.Groups[1].Value.ToLower() })

Write-Host "`n🎮 Video Scavenger Hunt - Local Development Setup" -ForegroundColor Cyan
Write-Host "================================================`n" -ForegroundColor Cyan

# Check WSL is available
Write-Host "🔍 Checking WSL..." -ForegroundColor Yellow
try {
    $wslVersion = wsl --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "WSL not found"
    }
    Write-Host "   ✓ WSL is installed" -ForegroundColor Green
} catch {
    Write-Host "   ✗ WSL is not installed. Please run: wsl --install -d Ubuntu-22.04" -ForegroundColor Red
    exit 1
}

# Check Ubuntu-22.04 is available
$distros = wsl -l -q
if ($distros -notcontains "Ubuntu-22.04") {
    Write-Host "   ✗ Ubuntu-22.04 not found. Please run: wsl --install -d Ubuntu-22.04" -ForegroundColor Red
    exit 1
}
Write-Host "   ✓ Ubuntu-22.04 is available" -ForegroundColor Green

# Get WSL IP
Write-Host "`n🌐 Getting WSL IP address..." -ForegroundColor Yellow
$wslIp = (wsl -d Ubuntu-22.04 -- hostname -I).Trim().Split()[0]
if (-not $wslIp) {
    Write-Host "   ✗ Failed to get WSL IP" -ForegroundColor Red
    exit 1
}
Write-Host "   ✓ WSL IP: $wslIp" -ForegroundColor Green

# Check if required tools are installed in WSL
Write-Host "`n🔧 Checking WSL dependencies..." -ForegroundColor Yellow

$nodeVersion = wsl -d Ubuntu-22.04 -- node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ✗ Node.js not installed in WSL. See docs/DEVELOPMENT.md for setup instructions." -ForegroundColor Red
    exit 1
}
Write-Host "   ✓ Node.js: $nodeVersion" -ForegroundColor Green

$funcVersion = wsl -d Ubuntu-22.04 -- func --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ✗ Azure Functions Core Tools not installed in WSL. See docs/DEVELOPMENT.md for setup instructions." -ForegroundColor Red
    exit 1
}
Write-Host "   ✓ Azure Functions Core Tools: $funcVersion" -ForegroundColor Green

$azuriteCheck = wsl -d Ubuntu-22.04 -- which azurite 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ✗ Azurite not installed in WSL. Run: wsl -d Ubuntu-22.04 -- sudo npm install -g azurite" -ForegroundColor Red
    exit 1
}
Write-Host "   ✓ Azurite is installed" -ForegroundColor Green

# Kill any existing processes
Write-Host "`n🧹 Cleaning up existing processes..." -ForegroundColor Yellow
wsl -d Ubuntu-22.04 -- bash -c "pkill -f azurite 2>/dev/null; pkill -f 'func start' 2>/dev/null" 2>$null
Start-Sleep -Seconds 1
Write-Host "   ✓ Cleaned up" -ForegroundColor Green

# Start Azurite in background
Write-Host "`n📦 Starting Azurite (Storage Emulator)..." -ForegroundColor Yellow
$azuriteJob = Start-Job -ScriptBlock {
    wsl -d Ubuntu-22.04 -- bash -c "mkdir -p ~/azurite-data && azurite --location ~/azurite-data --blobPort 10000 --queuePort 10001 --tablePort 10002 2>&1"
}
Start-Sleep -Seconds 2

# Check if Azurite started
$azuriteRunning = wsl -d Ubuntu-22.04 -- bash -c "pgrep -f azurite" 2>&1
if ($azuriteRunning) {
    Write-Host "   ✓ Azurite started (ports 10000-10002)" -ForegroundColor Green
} else {
    Write-Host "   ✗ Failed to start Azurite" -ForegroundColor Red
    exit 1
}

# Install functions dependencies if needed
$functionsNodeModules = Join-Path $PSScriptRoot "functions\node_modules"
if (-not (Test-Path $functionsNodeModules)) {
    Write-Host "`n📦 Installing functions dependencies..." -ForegroundColor Yellow
    wsl -d Ubuntu-22.04 -- bash -c "cd ${wslRepoRoot}/functions && npm install 2>&1" | Out-Null
    Write-Host "   ✓ Dependencies installed" -ForegroundColor Green
}

# Build functions
Write-Host "`n🔨 Building Azure Functions..." -ForegroundColor Yellow
$buildResult = wsl -d Ubuntu-22.04 -- bash -c "cd ${wslRepoRoot}/functions && npm run build 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ✗ Build failed:" -ForegroundColor Red
    Write-Host $buildResult
    exit 1
}
Write-Host "   ✓ Build complete" -ForegroundColor Green

# Start Azure Functions in background
Write-Host "`n⚡ Starting Azure Functions on port $FunctionsPort..." -ForegroundColor Yellow
$funcJob = Start-Job -ScriptBlock {
    param($port, $wslPath)
    wsl -d Ubuntu-22.04 -- bash -c "cd ${wslPath}/functions && func start --port $port 2>&1"
} -ArgumentList $FunctionsPort, $wslRepoRoot

# Wait for functions to start
Write-Host "   Waiting for functions to initialize..." -ForegroundColor Gray
$maxRetries = 30
$retry = 0
$functionsReady = $false

while ($retry -lt $maxRetries -and -not $functionsReady) {
    Start-Sleep -Seconds 1
    try {
        $response = curl.exe -s "http://${wslIp}:${FunctionsPort}/api/me" 2>$null
        if ($response) {
            $functionsReady = $true
        }
    } catch {}
    $retry++
    Write-Host "." -NoNewline -ForegroundColor Gray
}
Write-Host ""

if ($functionsReady) {
    Write-Host "   ✓ Azure Functions started" -ForegroundColor Green
} else {
    Write-Host "   ✗ Azure Functions failed to start. Check the background job with: Receive-Job $($funcJob.Id)" -ForegroundColor Red
    exit 1
}

# Update Vite config with WSL IP
Write-Host "`n📝 Updating Vite proxy configuration..." -ForegroundColor Yellow
$viteConfigPath = Join-Path $PSScriptRoot "web\vite.config.ts"
$viteConfig = Get-Content $viteConfigPath -Raw

# Replace the target URL with current WSL IP
$pattern = "target: 'http://[^']+'"
$replacement = "target: 'http://${wslIp}:${FunctionsPort}'"
$newConfig = $viteConfig -replace $pattern, $replacement
$newConfig | Set-Content $viteConfigPath -NoNewline

Write-Host "   ✓ Updated proxy target to http://${wslIp}:${FunctionsPort}" -ForegroundColor Green

# Seed database
if (-not $SkipSeed) {
    Write-Host "`n🌱 Seeding database..." -ForegroundColor Yellow
    
    $scenariosResult = curl.exe -s -X POST "http://${wslIp}:${FunctionsPort}/api/scenarios/seed" 2>&1
    if ($scenariosResult -match '"total":\s*(\d+)') {
        Write-Host "   ✓ Scenarios: $($Matches[1]) seeded" -ForegroundColor Green
    } else {
        Write-Host "   ✓ Scenarios already seeded or updated" -ForegroundColor Green
    }
    
    $gamekeepersResult = curl.exe -s -X POST "http://${wslIp}:${FunctionsPort}/api/gamekeepers/seed" 2>&1
    Write-Host "   ✓ Game keeper seeded" -ForegroundColor Green
}

# Install web dependencies if needed
$nodeModulesPath = Join-Path $PSScriptRoot "web\node_modules"
if (-not (Test-Path $nodeModulesPath)) {
    Write-Host "`n📦 Installing web dependencies..." -ForegroundColor Yellow
    Push-Location (Join-Path $PSScriptRoot "web")
    npm install
    Pop-Location
    Write-Host "   ✓ Dependencies installed" -ForegroundColor Green
}

# Start Vite dev server
Write-Host "`n🚀 Starting Vite dev server..." -ForegroundColor Yellow
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Development environment is ready!" -ForegroundColor Green
Write-Host ""
Write-Host "  🌐 Web App:     http://localhost:5173" -ForegroundColor White
Write-Host "  ⚡ Functions:   http://${wslIp}:${FunctionsPort}" -ForegroundColor White
Write-Host "  📦 Azurite:     Ports 10000-10002 (in WSL)" -ForegroundColor White
Write-Host ""
Write-Host "  Press Ctrl+C to stop all services" -ForegroundColor Gray
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Register cleanup handler
$cleanup = {
    Write-Host "`n`n🛑 Shutting down..." -ForegroundColor Yellow
    wsl -d Ubuntu-22.04 -- bash -c "pkill -f azurite 2>/dev/null; pkill -f 'func start' 2>/dev/null"
    Get-Job | Stop-Job
    Get-Job | Remove-Job
    Write-Host "   ✓ All services stopped" -ForegroundColor Green
}

try {
    # Start Vite in foreground
    Push-Location (Join-Path $PSScriptRoot "web")
    npm run dev
} finally {
    & $cleanup
    Pop-Location
}
