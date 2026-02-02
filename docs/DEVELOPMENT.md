# Local Development Setup

This guide explains how to set up and run the Video Scavenger Hunt app locally.

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| Windows x64 | ✅ Native | Azure Functions runs directly |
| Windows ARM64 | ⚠️ WSL Required | Azure Functions Core Tools has a bug on ARM64 |
| macOS | ✅ Native | Azure Functions runs directly |
| Linux | ✅ Native | Azure Functions runs directly |

## Prerequisites

### All Platforms

1. **Node.js 20.x LTS**
   - Download from: https://nodejs.org/
   - ⚠️ **Node.js 24+ is NOT compatible** with Azure Functions Core Tools

2. **Azure Functions Core Tools v4**
   ```bash
   npm install -g azure-functions-core-tools@4 --unsafe-perm true
   ```

3. **Azurite** (Azure Storage Emulator)
   ```bash
   npm install -g azurite
   ```

### Verify Installation

```bash
node --version      # Should be v20.x.x
func --version      # Should be 4.x.x
azurite --version   # Should show version
```

---

## Windows ARM64 Only: WSL Setup

> **Skip this section** if you're on Windows x64, macOS, or Linux.

Azure Functions Core Tools 4.6.0 has a bug on Windows ARM64. Use WSL as a workaround.

### 1. Install WSL with Ubuntu

```powershell
wsl --install -d Ubuntu-22.04
```

Restart your computer if prompted, then open Ubuntu from the Start menu to complete setup.

### 2. Install Dependencies in WSL

Open Ubuntu terminal and run:

```bash
# Update packages
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Azure Functions Core Tools
curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > microsoft.gpg
sudo mv microsoft.gpg /etc/apt/trusted.gpg.d/microsoft.gpg
sudo sh -c 'echo "deb [arch=amd64] https://packages.microsoft.com/repos/microsoft-ubuntu-$(lsb_release -cs)-prod $(lsb_release -cs) main" > /etc/apt/sources.list.d/dotnetdev.list'
sudo apt-get update
sudo apt-get install -y azure-functions-core-tools-4

# Install Azurite
sudo npm install -g azurite
```

### 3. Verify WSL Installation

```bash
node --version      # Should be v20.x.x
func --version      # Should be 4.x.x
azurite --version   # Should show version
```

---

## Quick Start

### Windows ARM64 (with WSL)

From the repository root in PowerShell:

```powershell
.\start-dev.ps1
```

This script automatically:
1. ✅ Verifies WSL and all dependencies
2. ✅ Starts Azurite in WSL
3. ✅ Builds and starts Azure Functions in WSL
4. ✅ Detects WSL IP and updates Vite proxy
5. ✅ Seeds the database with sample data
6. ✅ Starts the Vite dev server

**Stop all services:**
```powershell
.\stop-dev.ps1
```

### All Other Platforms (Native)

**Terminal 1 - Storage Emulator:**
```bash
mkdir -p .azurite
azurite --location .azurite --blobPort 10000 --queuePort 10001 --tablePort 10002
```

**Terminal 2 - Install & Build:**
```bash
# Install dependencies
cd web && npm install && cd ..
cd functions && npm install && npm run build && cd ..
```

**Terminal 2 - Start Functions:**
```bash
cd functions
func start --port 7071
```

**Terminal 3 - Seed Database (first time only):**
```bash
curl -X POST http://localhost:7071/api/scenarios/seed
curl -X POST http://localhost:7071/api/gamekeepers/seed
```

**Terminal 3 - Start Web Dev Server:**
```bash
cd web
npm run dev
```

**App URL:** http://localhost:5173

---

## Architecture

### Native Setup (x64/macOS/Linux)
```
┌─────────────────────────────────────────────────────────────┐
│  ┌─────────────────┐      ┌─────────────────┐              │
│  │  Vite Dev       │      │ Azure Functions │              │
│  │  :5173          │─────▶│  :7071          │              │
│  └─────────────────┘      └────────┬────────┘              │
│                                    │                        │
│                           ┌────────▼────────┐              │
│                           │    Azurite      │              │
│                           │ :10000-10002    │              │
│                           └─────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

### WSL Setup (Windows ARM64)
```
┌─────────────────────────────────────────────────────────────┐
│                        Windows                               │
│  ┌─────────────────┐                                        │
│  │  Vite Dev       │ http://localhost:5173                  │
│  │  Server         │────────────────────────┐               │
│  └─────────────────┘                        │               │
│                                             │ /api proxy    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    WSL2 (Ubuntu)                        ││
│  │  ┌─────────────────┐      ┌─────────────────┐          ││
│  │  │ Azure Functions │      │    Azurite      │          ││
│  │  │  :7072          │─────▶│ :10000-10002    │          ││
│  │  └─────────────────┘      └─────────────────┘          ││
│  │         ▲                                               ││
│  │         │ http://<wsl-ip>:7072                         ││
│  └─────────│───────────────────────────────────────────────┘│
│            │                                                │
└────────────┴────────────────────────────────────────────────┘
```

---

## Troubleshooting

### "Connection refused" when calling API

**On WSL:** The WSL IP address changes between reboots. Run `.\start-dev.ps1` again to auto-detect the new IP.

**Manual fix:**
```powershell
$wslIp = (wsl -d Ubuntu-22.04 -- hostname -I).Trim().Split()[0]
Write-Host "Update vite.config.ts target to: http://${wslIp}:7072"
```

### Azure Functions won't start

1. **Check if port is in use:**
   ```bash
   # Linux/macOS/WSL
   lsof -i :7071
   
   # Windows
   netstat -ano | findstr :7071
   ```

2. **Kill existing processes:**
   ```bash
   # Linux/macOS/WSL
   pkill -f "func start"
   ```

3. **Ensure Azurite is running** - Functions need storage to start.

### "TableClient" or storage errors

Azurite must be running before starting Functions. The Tables service runs on port 10002.

### Node.js version errors

Azure Functions Core Tools v4 requires Node.js 18.x or 20.x:
```bash
node --version
```

If you have Node 24+, downgrade to Node 20 LTS.

### Reset all data

```bash
# Delete Azurite data
rm -rf .azurite/*        # Native
rm -rf ~/azurite-data/*  # WSL

# Restart services and re-seed
curl -X POST http://localhost:7071/api/scenarios/seed
curl -X POST http://localhost:7071/api/gamekeepers/seed
```

---

## Testing Authentication

Static Web Apps authentication is simulated locally via `/.auth/login/aad`.

### Test as Game Keeper
1. Click "Sign In" on landing page
2. Enter email: `scott@kurtzeborn.org`
3. You'll be recognized as a game keeper with full access

### Test as New User
1. Click "Sign In"
2. Enter any other email
3. You'll see the registration flow

---

## API Reference

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/me` | GET | - | Current user auth status |
| `/api/scenarios` | GET | - | List all scenarios |
| `/api/scenarios/seed` | POST | - | Seed sample scenarios |
| `/api/games` | GET | Game Keeper | List your games |
| `/api/games` | POST | Game Keeper | Create a new game |
| `/api/games/:id` | GET | - | Get game details |
| `/api/games/:id` | PATCH | Game Keeper | Update game |
| `/api/games/:id` | DELETE | Game Keeper | Delete game |
| `/api/games/:id/start` | POST | Game Keeper | Start the game |
| `/api/gamekeepers` | GET | - | List game keepers |
| `/api/gamekeepers/seed` | POST | - | Seed initial game keeper |

---

## Environment Variables

The Functions app uses these settings (configured in `local.settings.json`):

| Variable | Value | Description |
|----------|-------|-------------|
| `AzureWebJobsStorage` | `UseDevelopmentStorage=true` | Use Azurite for storage |
| `FUNCTIONS_WORKER_RUNTIME` | `node` | Node.js runtime |

---

## For AI Agents

If you're an AI agent setting up this project:

1. **Detect the platform** - Check if Windows ARM64 (needs WSL) or other (native)
2. **Verify prerequisites** - Run version checks before proceeding
3. **Use the scripts** - On Windows ARM64, `.\start-dev.ps1` handles everything
4. **Check connectivity** - After starting, verify API responds
5. **Seed data** - The start script does this automatically, verify via `/api/scenarios`

### Platform Detection

```powershell
# PowerShell - Check if ARM64
if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
    Write-Host "Windows ARM64 - Use WSL setup"
} else {
    Write-Host "Native setup supported"
}
```

```bash
# Bash - Check architecture
uname -m  # x86_64 = native, arm64/aarch64 = check OS
```

### Quick Verification Commands

```bash
# Check web app is running
curl -s http://localhost:5173 | head -c 100

# Check API is responding (native)
curl -s http://localhost:7071/api/me

# Verify scenarios are seeded (should return 23)
curl -s http://localhost:7071/api/scenarios | grep -o '"id"' | wc -l
```

```powershell
# PowerShell - Check API (WSL setup)
$wslIp = (wsl -d Ubuntu-22.04 -- hostname -I).Trim().Split()[0]
curl.exe -s "http://${wslIp}:7072/api/me"

# Verify scenarios
(curl.exe -s "http://${wslIp}:7072/api/scenarios" | ConvertFrom-Json).Count
```
