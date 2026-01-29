# Video Scavenger Hunt - Development Plan

## 1. Overview

A multiplayer video scavenger hunt game where teams compete to act out scenarios and capture them on video. A game keeper manages the session and reviews submissions at the end.

### Core Flow
1. **Game Keeper** creates a game session with selected scenarios
2. **Players** join via game code, form teams (2-6 players each)
3. **Teams** complete scenarios by recording and uploading 30-second videos
4. **Real-time scoreboard** shows scenario completion count per team
5. **Game Keeper** reviews all videos scenario-by-scenario, awards bonus points
6. **Final scores** displayed, videos can be cleaned up

---

## 2. Requirements Summary

| Requirement | Value |
|------------|-------|
| Team Size | 2-6 players |
| Teams per Game | 2-20 teams |
| Scenarios per Game | 10 (default), 15, or 20 |
| Time Limit | 6 min/scenario default (60 min for 10), configurable |
| Video Duration | 30 seconds max |
| Scoring | 1 point per completion + 1 bonus point available per scenario |
| Video Retention | 7 days auto-delete, manual cleanup available |
| Real-time Updates | Within 30 seconds acceptable |

---

## 3. Platform Options Analysis

### Option A: Progressive Web App (PWA) ⭐ RECOMMENDED

**Description**: Mobile-first responsive web app using modern browser APIs.

| Pros | Cons |
|------|------|
| No app store approval needed | iOS Safari MediaRecorder support added in iOS 14.3, may have quirks |
| Players join via QR code/link instantly | No push notifications (not needed for this use case) |
| Single codebase for all platforms | Camera quality controlled by browser, not app |
| Easy updates - deploy and everyone has latest | |
| MediaRecorder API can enforce 30-second limit | |
| Works on phones, tablets, and laptops | |

**Browser Support**: MediaRecorder API is supported in Chrome, Firefox, Safari (14.3+), Edge.

**Camera Recording Flow**:
```
1. Player taps "Record Video" for scenario
2. Browser requests camera permission (one-time)
3. Live preview shows, countdown timer starts
4. Recording auto-stops at 30 seconds
5. Player previews video, confirms or re-records
6. Video uploads in background
```

### Option B: Native Apps (React Native / Flutter)

| Pros | Cons |
|------|------|
| Best camera control and quality | 1-7 day app store review times |
| Native UI feel | Requires players to download app before event |
| Push notifications | Two codebases or cross-platform complexity |
| Offline recording with sync | Higher development effort |

### Option C: Hybrid (Capacitor/Ionic)

| Pros | Cons |
|------|------|
| Web codebase with native plugins | Still requires app store for full features |
| Native camera plugins available | Added build complexity |
| Single codebase | Debugging across layers |

### Recommendation: **PWA (Option A)**

For an event-based game where participants need to join quickly:
- QR code → instant join (no app download)
- Modern browser APIs handle video capture well
- 30-second limit enforceable via MediaRecorder
- Fallback: allow file upload from camera roll if needed

---

## 4. Authentication Options Analysis

### Option A: Fully Anonymous (Game Codes Only)

**Flow**: Enter game code → Pick team → Enter display name

| Pros | Cons |
|------|------|
| Zero friction - perfect for events | No persistent identity |
| No account creation | Can't track player history |
| Works for all ages | Potential for trolling (mitigated by game code secrecy) |

### Option B: Full Authentication (Microsoft/Google SSO)

| Pros | Cons |
|------|------|
| Verified identities | Friction at event time |
| Persistent history | Privacy concerns |
| Secure | May exclude some participants |

### Option C: Hybrid Authentication ⭐ RECOMMENDED

**Game Keeper**: Authenticated via Microsoft Entra ID (required to create/manage games)
**Players**: Anonymous with game code + team selection + display name

| Pros | Cons |
|------|------|
| Low friction for players | Slightly more complex implementation |
| Secure management for game keeper | |
| Game codes are time-limited and single-use | |
| Can restrict game creation to authorized users | |

### Recommendation: **Hybrid (Option C)**

- Game keeper must sign in (protects game creation, video cleanup)
- Players just need game code (printed on handout, shown on screen)
- Player identity = Team + Display Name (stored in session/local storage)

---

## 5. Architecture

```
┌─────────────────┐     ┌──────────────────────────────────┐
│  Cloudflare     │     │          Azure                   │
│  Pages (Free)   │     │                                  │
│                 │     │  ┌────────────────────────────┐  │
│  - React SPA    │────▶│  │ Azure Functions (Free)     │  │
│  - PWA          │     │  │ - Game management API      │  │
│                 │     │  │ - Video upload (SAS tokens)│  │
└─────────────────┘     │  │ - Scoreboard API           │  │
                        │  └────────────────────────────┘  │
                        │               │                  │
                        │  ┌────────────┴───────────────┐  │
                        │  │                            │  │
                        │  ▼                            ▼  │
                        │  ┌─────────────┐ ┌────────────┐  │
                        │  │ Cosmos DB   │ │ Blob       │  │
                        │  │ (Free Tier) │ │ Storage    │  │
                        │  │             │ │ (Videos)   │  │
                        │  │ - Games     │ │            │  │
                        │  │ - Teams     │ │ ~$0.02/GB  │  │
                        │  │ - Scenarios │ └────────────┘  │
                        │  │ - Scores    │                 │
                        │  └─────────────┘                 │
                        │                                  │
                        │  ┌────────────────────────────┐  │
                        │  │ SignalR (Free/Paid)        │  │
                        │  │ - Real-time scoreboard     │  │
                        │  └────────────────────────────┘  │
                        └──────────────────────────────────┘
```

---

## 6. Azure & Cloudflare Cost Analysis

### Free Tier Components

| Service | Free Tier Limits | Our Usage Estimate |
|---------|-----------------|-------------------|
| **Cloudflare Pages** | Unlimited sites, 500 builds/month | ✅ Sufficient |
| **Azure Functions (Consumption)** | 1M executions/month | ✅ Sufficient |
| **Azure Cosmos DB (Free Tier)** | 1000 RU/s, 25GB storage | ✅ Sufficient |
| **Azure SignalR (Free)** | 20K messages/day, 20 concurrent | ⚠️ May need upgrade |

### Paid Components

| Service | Cost | Notes |
|---------|------|-------|
| **Azure Blob Storage** | ~$0.02/GB/month | Videos stored here. 1 game (20 teams × 20 scenarios × 5MB) = 2GB ≈ $0.04 |
| **Azure SignalR (Standard)** | $50/month per unit | Only needed if >20 concurrent connections. 1 unit = 1000 connections |

### Cost Scenarios

**Small Event (10 teams, 10 scenarios)**
- Storage: ~500MB = $0.01/month
- SignalR: Free tier sufficient (10 teams × 4 avg players = 40 connections) ⚠️ May hit free limit
- **Total: ~$0.01-$50/month** (depends on SignalR needs)

**Large Event (20 teams, 20 scenarios)**
- Storage: ~2GB = $0.04/month
- SignalR: Standard tier likely needed = $50/month
- **Total: ~$50/month**

### Alternative: Polling Instead of SignalR

To stay fully free, we could use polling (every 15-30 seconds) instead of SignalR:
- Slightly higher API calls but within free tier
- 30-second update requirement is easily met
- **Recommendation**: Start with polling, add SignalR later if needed

---

## 7. Data Model

### Game
```typescript
interface Game {
  id: string;                    // Unique game ID (also the join code)
  createdBy: string;             // Game keeper's user ID
  createdAt: Date;
  status: 'lobby' | 'active' | 'judging' | 'complete';
  config: {
    scenarioCount: 10 | 15 | 20;
    timeLimit: number;           // Total minutes
    timeLimitPerScenario: number;
  };
  scenarios: ScenarioRef[];      // Selected scenarios for this game
  startedAt?: Date;
  endsAt?: Date;
}

interface ScenarioRef {
  scenarioId: string;
  order: number;
  bonusAwardedTo?: string;       // Team ID that got bonus point
}
```

### Team
```typescript
interface Team {
  id: string;
  gameId: string;
  name: string;
  color: string;                 // For UI display
  players: Player[];
  completedScenarios: string[];  // Scenario IDs
}

interface Player {
  id: string;                    // Session-generated ID
  displayName: string;
  joinedAt: Date;
}
```

### Scenario (Library)
```typescript
interface Scenario {
  id: string;
  title: string;                 // e.g., "Act out your best movie villain"
  description: string;           // Detailed instructions
  category?: string;             // For filtering/organization
  difficulty?: 'easy' | 'medium' | 'hard';
}
```

### Video Submission
```typescript
interface VideoSubmission {
  id: string;
  gameId: string;
  teamId: string;
  scenarioId: string;
  uploadedBy: string;            // Player ID
  blobUrl: string;
  uploadedAt: Date;
  durationSeconds: number;
}
```

---

## 8. API Endpoints

### Game Management (Game Keeper Only)
```
POST   /api/games                    Create new game
GET    /api/games/:id                Get game details
PATCH  /api/games/:id                Update game config
POST   /api/games/:id/start          Start the game
POST   /api/games/:id/end            End game early / move to judging
DELETE /api/games/:id                Delete game and all videos
```

### Team/Player (Players)
```
POST   /api/games/:id/join           Join game (select team, set name)
GET    /api/games/:id/teams          Get all teams and completion counts
```

### Videos
```
POST   /api/games/:id/videos/upload-url   Get SAS URL for upload
POST   /api/games/:id/videos              Register uploaded video
GET    /api/games/:id/videos              Get all videos (judging phase)
GET    /api/games/:id/videos/:scenarioId  Get videos for specific scenario
```

### Scoring (Game Keeper Only)
```
POST   /api/games/:id/bonus          Award bonus point for scenario
GET    /api/games/:id/scores         Get final scores
```

### Scenarios (Library)
```
GET    /api/scenarios                List all scenarios
POST   /api/scenarios                Add new scenario (admin)
```

---

## 9. User Experiences

### 9.1 Game Keeper Flow

```
1. Sign in with Microsoft
2. Create New Game
   - Select scenario count (10/15/20)
   - Set time limit
   - Get shareable game code / QR code
3. Wait in Lobby
   - See teams forming, player counts
   - "Start Game" button when ready
4. During Game
   - View live scoreboard
   - Can end game early
5. Judging Phase
   - Scenario-by-scenario video review
   - Play videos from each team
   - Award bonus point per scenario
   - "Next Scenario" to continue
6. Results
   - Final leaderboard
   - "Delete All Videos" cleanup button
   - "New Game" option
```

### 9.2 Player Flow

```
1. Scan QR code or enter game code
2. Enter display name
3. Select team (or create new team)
4. Wait in Lobby
   - See team members, other teams
5. Game Active
   - See list of scenarios with status
   - Tap scenario to record video
   - Camera opens with 30-second countdown
   - Preview and confirm upload
   - See scenario marked complete
   - View mini scoreboard (completion counts)
6. Time's Up
   - See final completion scoreboard
   - Wait for game keeper to start judging
7. Judging (View Only)
   - Optional: Watch along as game keeper plays videos
8. Results
   - See final scores with bonus points
```

---

## 10. Video Capture Implementation

### MediaRecorder API Approach

```typescript
async function startRecording(): Promise<Blob> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: 1280, height: 720 },
    audio: true
  });
  
  const recorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9'
  });
  
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  
  recorder.start();
  
  // Auto-stop at 30 seconds
  setTimeout(() => recorder.stop(), 30000);
  
  return new Promise((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };
  });
}
```

### Fallback: File Upload
```typescript
// For browsers with poor MediaRecorder support
<input 
  type="file" 
  accept="video/*" 
  capture="environment"
  onChange={handleFileSelect}
/>

function handleFileSelect(file: File) {
  // Validate duration client-side (approximate via file size or Video element)
  // Upload to blob storage
}
```

### Video Upload Flow

```
1. Client requests SAS token from API
2. API generates time-limited SAS URL for blob upload
3. Client uploads directly to Azure Blob Storage
4. Client notifies API that upload is complete
5. API updates game state, marks scenario complete for team
```

---

## 11. Real-Time Updates

### Polling Approach (Recommended for MVP)

```typescript
// Poll every 15 seconds during active game
useEffect(() => {
  const interval = setInterval(async () => {
    const teams = await fetch(`/api/games/${gameId}/teams`);
    setTeamScores(teams);
  }, 15000);
  
  return () => clearInterval(interval);
}, [gameId]);
```

### SignalR Approach (Future Enhancement)

```typescript
const connection = new signalR.HubConnectionBuilder()
  .withUrl('/api/scorehub')
  .build();

connection.on('ScoreUpdated', (teamId, completedCount) => {
  updateScoreboard(teamId, completedCount);
});
```

---

## 12. Video Storage & Cleanup

### Blob Structure
```
videos/
  {gameId}/
    {teamId}/
      {scenarioId}.webm
```

### Auto-Cleanup (7 Days)

Use Azure Blob Storage Lifecycle Management:
```json
{
  "rules": [
    {
      "name": "DeleteOldVideos",
      "type": "Lifecycle",
      "definition": {
        "filters": {
          "blobTypes": ["blockBlob"],
          "prefixMatch": ["videos/"]
        },
        "actions": {
          "baseBlob": {
            "delete": { "daysAfterCreationGreaterThan": 7 }
          }
        }
      }
    }
  ]
}
```

### Manual Cleanup

Game keeper can trigger immediate deletion:
```
DELETE /api/games/:id → Deletes all blobs in videos/{gameId}/ + database records
```

---

## 13. Technology Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS
- **PWA**: Vite PWA plugin
- **Video**: MediaRecorder API + Video element
- **State**: React Query for server state
- **Hosting**: Cloudflare Pages

### Backend
- **Runtime**: Azure Functions (Node.js 20, TypeScript)
- **Database**: Azure Cosmos DB (NoSQL, Free Tier)
- **Storage**: Azure Blob Storage
- **Auth**: Azure Entra ID (for game keeper)
- **Real-time**: Polling initially, SignalR later

### DevOps
- **Repo**: GitHub (kurtzeborn/scavenger-hunt)
- **CI/CD**: GitHub Actions
- **Frontend Deploy**: Cloudflare Pages auto-deploy
- **Backend Deploy**: Azure Functions via GitHub Actions

---

## 14. Project Structure

```
scavenger-hunt/
├── README.md
├── docs/
│   └── plan.md
├── web/                          # React PWA
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── GameKeeper/
│       │   ├── Player/
│       │   └── shared/
│       ├── hooks/
│       ├── api/
│       └── types/
├── functions/                    # Azure Functions
│   ├── package.json
│   ├── host.json
│   ├── tsconfig.json
│   └── src/
│       ├── games/
│       ├── teams/
│       ├── videos/
│       ├── scenarios/
│       └── shared/
└── infrastructure/               # Bicep/ARM templates
    ├── main.bicep
    └── modules/
```

---

## 15. Development Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Project setup (React + Vite + Azure Functions)
- [ ] Basic authentication (Entra ID for game keeper)
- [ ] Cosmos DB setup and data models
- [ ] Game CRUD operations
- [ ] Scenario library (seed with 20-30 scenarios)

### Phase 2: Core Gameplay (Week 3-4)
- [ ] Player join flow (game code, team selection)
- [ ] Lobby experience (waiting for game start)
- [ ] Scenario list UI
- [ ] Video capture with MediaRecorder
- [ ] Video upload to Blob Storage
- [ ] Scenario completion tracking

### Phase 3: Real-Time & Scoring (Week 5)
- [ ] Polling-based scoreboard updates
- [ ] Game timer implementation
- [ ] End-of-game state transitions
- [ ] Judging phase video playback
- [ ] Bonus point awarding

### Phase 4: Polish & Deployment (Week 6)
- [ ] PWA manifest and service worker
- [ ] QR code generation for game codes
- [ ] Responsive design polish
- [ ] Cloudflare Pages deployment
- [ ] Azure Functions deployment
- [ ] Blob lifecycle rules
- [ ] End-to-end testing

### Phase 5: Future Enhancements
- [ ] SignalR for instant updates (if needed)
- [ ] Scenario categories and difficulty
- [ ] Custom scenario creation per game
- [ ] Video thumbnails
- [ ] Share/download final video compilation

---

## 16. Scenario Library (Initial Set)

Here are 20 starter scenarios to seed the library:

1. **The Movie Star** - Act out your best impression of a famous movie villain
2. **Human Statue** - Create a living recreation of a famous landmark
3. **Silent Story** - Tell a story without using any words (charades style)
4. **Nature Documentary** - Narrate your teammate like they're a wild animal
5. **Infomercial** - Sell an ordinary object like it's the greatest invention ever
6. **Time Traveler** - Act out someone from 200 years ago using a smartphone
7. **Dance Battle** - Have a 20-second dance-off between teammates
8. **Superhero Origin** - Create and act out a new superhero's origin story
9. **Cooking Show Disaster** - Pretend to host a cooking show that goes wrong
10. **Award Acceptance** - Give an over-the-top award acceptance speech
11. **Tech Support** - Act out explaining the internet to someone from 1800
12. **Talent Show** - Perform your most unique hidden talent
13. **Movie Trailer** - Create a trailer for an imaginary blockbuster movie
14. **Alien Encounter** - Act out first contact with an alien civilization
15. **Sports Commentary** - Provide dramatic commentary for an everyday activity
16. **News Report** - Report breaking news about something mundane
17. **Fashion Show** - Do a runway walk with whatever you're wearing
18. **Robot Malfunction** - Act like a robot that's glitching out
19. **Secret Agent** - Act out a spy on a crucial mission
20. **Worst Job Interview** - Demonstrate the worst possible job interview

---

## 17. Open Questions

1. **Team Creation**: Should players be able to create new teams, or only join existing ones created by game keeper?
   - Proposed: Players can create teams up to max team count (20)

2. **Team Locking**: Should teams lock once game starts (no new players)?
   - Proposed: Yes, lock teams once game is active

3. **Video Re-recording**: Can a team re-record a scenario after uploading?
   - Proposed: No, first upload is final (keeps it simple, encourages commitment)

4. **Simultaneous Viewers**: During judging, should players see the same videos as game keeper in real-time?
   - Proposed: Optional - game keeper can share screen, or players just wait for scores

5. **Game History**: Should completed games be viewable for 7 days (until videos expire)?
   - Proposed: Yes, game keeper can view past games and scores

---

## 18. Success Metrics

- **Performance**: Video upload completes within 10 seconds for 30-second video
- **Reliability**: 99% uptime during active games
- **Usability**: Player can join and record first video within 2 minutes
- **Scale**: Support 20 teams × 6 players = 120 concurrent players
- **Cost**: Stay under $50/month for typical usage

---

## 19. Next Steps

1. ✅ Create repository with plan
2. [ ] Set up project structure (web + functions folders)
3. [ ] Initialize Azure resources (Cosmos DB, Storage, Functions)
4. [ ] Implement authentication
5. [ ] Build game creation flow
6. [ ] Implement player join experience
7. [ ] Add video capture and upload
8. [ ] Build judging experience
9. [ ] Deploy and test end-to-end
