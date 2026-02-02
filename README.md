# Video Scavenger Hunt

A multiplayer video scavenger hunt game where teams compete to act out scenarios and capture them on video. A game keeper manages the session and reviews submissions at the end.

**Production URL**: https://vsh.k61.dev

## Quick Start (Windows with WSL)

### Prerequisites

- **Windows**: WSL2 with Ubuntu 22.04
- **In WSL**: Node.js 20, Azure Functions Core Tools v4, Azurite

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for detailed setup instructions.

### One-Command Start

```powershell
.\start-dev.ps1
```

This automatically:
- Starts Azurite (storage emulator) in WSL
- Builds and starts Azure Functions in WSL  
- Detects WSL IP and configures Vite proxy
- Seeds the database with sample scenarios
- Starts the Vite dev server

**App URL**: http://localhost:5173

### Stop All Services

```powershell
.\stop-dev.ps1
```

## Manual Setup

If you prefer manual control or need to troubleshoot:

1. **Install dependencies:**
   ```bash
   # Install web dependencies
   cd web
   npm install

   # Install functions dependencies
   cd ../functions
   npm install
   ```

2. **Start Azurite in WSL:**
   ```bash
   # In WSL terminal
   mkdir -p ~/azurite-data
   azurite --location ~/azurite-data --blobPort 10000 --queuePort 10001 --tablePort 10002
   ```

3. **Start Functions in WSL:**
   ```bash
   # In another WSL terminal
   cd /mnt/c/repos/scavenger-hunt/functions
   npm run build
   func start --port 7072
   ```

4. **Seed the database:**
   ```powershell
   $wslIp = (wsl -d Ubuntu-22.04 -- hostname -I).Trim().Split()[0]
   curl.exe -X POST "http://${wslIp}:7072/api/scenarios/seed"
   curl.exe -X POST "http://${wslIp}:7072/api/gamekeepers/seed"
   ```

5. **Update Vite proxy** in `web/vite.config.ts` with WSL IP, then:
   ```powershell
   cd web
   npm run dev
   ```

   This starts both the frontend and API with mock authentication.

5. **Or run separately:**
   ```bash
   # Terminal 1: Run functions
   cd functions
   npm start

   # Terminal 2: Run web
   cd web
   npm run dev
   ```

## Mock Authentication (Local Dev)

When running locally, SWA authentication is simulated:
- Click "Sign In" on the landing page
- Enter any user info (e.g., email: `scott@kurtzeborn.org`)
- The app will treat you as authenticated

To test as a game keeper, sign in with `scott@kurtzeborn.org` (seeded by default).

## Project Structure

```
scavenger-hunt/
├── web/                          # React PWA (Vite + TypeScript + Tailwind)
│   ├── src/
│   │   ├── pages/               # Page components
│   │   ├── contexts/            # React contexts (auth, etc.)
│   │   └── types/               # TypeScript types
│   └── package.json
├── functions/                    # Azure Functions API
│   ├── src/
│   │   ├── functions/           # HTTP endpoints
│   │   ├── types.ts             # Shared types
│   │   ├── storage.ts           # Table/Blob storage clients
│   │   └── auth.ts              # Authentication helpers
│   └── package.json
├── staticwebapp.config.json      # SWA routing and auth config
└── docs/
    └── plan.md                   # Full project plan
```

## API Endpoints

### Public
- `GET /api/scenarios` - List all scenarios
- `GET /api/games/:id` - Get game details (for players)
- `GET /api/me` - Get current auth status

### Game Keeper Only
- `POST /api/games` - Create a new game
- `GET /api/games` - List your games
- `PATCH /api/games/:id` - Update game config
- `DELETE /api/games/:id` - Delete game
- `POST /api/games/:id/start` - Start the game

### Dev/Admin
- `POST /api/scenarios/seed` - Seed scenario library
- `POST /api/gamekeepers/seed` - Seed initial game keeper

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Font Awesome
- **Backend**: Azure Functions (Node.js 20, TypeScript)
- **Database**: Azure Table Storage
- **Media Storage**: Azure Blob Storage
- **Auth**: Azure Entra ID (via Static Web Apps)
- **Hosting**: Azure Static Web Apps

## Development Phases

- [x] **Phase 1**: Foundation - Project setup, auth, data models, CRUD APIs
- [ ] **Phase 2**: Core Gameplay - Player join, lobby, media capture, uploads
- [ ] **Phase 3**: Real-Time & Scoring - Scoreboard, timer, judging
- [ ] **Phase 4**: Polish & Deployment - PWA, QR codes, deployment
- [ ] **Phase 5**: Future Enhancements

## License

Private project - © Scott Kurtzeborn
