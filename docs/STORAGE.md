# Storage Architecture

This document describes how Azure Storage is used in the Video Scavenger Hunt application.

## Overview

The application uses two types of Azure Storage:
- **Azure Table Storage** - NoSQL key-value store for game state, teams, scenarios, and metadata
- **Azure Blob Storage** - Object storage for photos and videos uploaded by players

```mermaid
flowchart TB
    subgraph "Azure Functions API"
        API["HTTP Endpoints"]
    end

    subgraph "Table Storage"
        direction TB
        Games["games table"]
        Teams["teams table"]
        Scenarios["scenarios table"]
        GameKeepers["gamekeepers table"]
        MediaSubs["mediasubmissions table"]
    end

    subgraph "Blob Storage"
        direction TB
        MediaContainer["media container"]
        subgraph "Blob Structure"
            GameFolder["{gameId}/"]
            TeamFolder["{gameId}/{teamId}/"]
            MediaBlob["{gameId}/{teamId}/{scenarioId}.mp4|.jpg"]
        end
    end

    API --> Games
    API --> Teams
    API --> Scenarios
    API --> GameKeepers
    API --> MediaSubs
    API --> MediaContainer
    GameFolder --> TeamFolder --> MediaBlob
```

---

## Table Storage

Table Storage uses a partition key + row key model for efficient querying. All tables are auto-created on application startup.

### Tables

| Table Name | Purpose |
|------------|---------|
| `games` | Game sessions with config, status, and timing |
| `teams` | Teams within each game |
| `scenarios` | Library of reusable scenarios |
| `gamekeepers` | Authorized game keeper email allowlist |
| `mediasubmissions` | Metadata for uploaded photos/videos |

### Partition Strategies

```mermaid
erDiagram
    games {
        string partitionKey "Fixed: 'game'"
        string rowKey "Game ID (4-letter code)"
        string createdBy "Game keeper email"
        string status "lobby|active|paused|judging|revealing|complete"
        object config "scenarioCount, timeLimit, etc."
        array scenarios "ScenarioRef objects"
        datetime startedAt
        datetime endsAt
    }

    teams {
        string partitionKey "Game ID"
        string rowKey "Team ID (UUID)"
        string name "Team name"
        string color "Assigned color"
        array players "Player objects"
        array crewMembers "Crew member objects"
        array completedScenarios "Scenario IDs"
    }

    scenarios {
        string partitionKey "Category (location|general|church)"
        string rowKey "Scenario ID (UUID)"
        string title "Scenario title"
        string description "Instructions"
        string mediaType "photo|video"
    }

    gamekeepers {
        string partitionKey "Fixed: 'gamekeeper'"
        string rowKey "Email (lowercase)"
        string displayName "Name from Microsoft profile"
        string addedBy "Email of inviter"
    }

    mediasubmissions {
        string partitionKey "Game ID"
        string rowKey "teamId_scenarioId"
        string teamId "Team ID"
        string scenarioId "Scenario ID"
        string blobUrl "Full blob URL"
        string mediaType "photo|video"
        string status "uploading|complete|failed"
        string uploadedBy "Player ID"
    }

    games ||--o{ teams : "contains"
    games ||--o{ mediasubmissions : "has"
    teams ||--o{ mediasubmissions : "uploads"
```

### Query Patterns

| Query | Implementation |
|-------|----------------|
| Get game by code | `games` table: partitionKey='game', rowKey='{gameCode}' |
| Get all teams for a game | `teams` table: partitionKey='{gameId}' |
| Get all scenarios | `scenarios` table: list all entities |
| Get scenarios by category | `scenarios` table: partitionKey='{category}' |
| Check if email is game keeper | `gamekeepers` table: partitionKey='gamekeeper', rowKey='{email}' |
| Get media for a game | `mediasubmissions` table: partitionKey='{gameId}' |
| Get specific submission | `mediasubmissions` table: partitionKey='{gameId}', rowKey='{teamId}_{scenarioId}' |

---

## Blob Storage

Blob Storage holds all uploaded photos and videos. A single container named `media` is used.

### Container Structure

```
media/
├── {gameId}/
│   ├── {teamId}/
│   │   ├── {scenarioId}.jpg    # Photo submissions
│   │   ├── {scenarioId}.mp4    # Video submissions (or .webm)
│   │   └── ...
│   └── {anotherTeamId}/
│       └── ...
└── {anotherGameId}/
    └── ...
```

### Upload Flow

```mermaid
sequenceDiagram
    participant Player
    participant API as Azure Functions
    participant Blob as Blob Storage
    participant Table as Table Storage

    Player->>API: POST /api/games/:id/videos/upload-url
    API->>API: Generate SAS token (write-only, 5 min expiry)
    API-->>Player: Return SAS URL

    Player->>Blob: PUT blob (direct upload with SAS)
    Blob-->>Player: 201 Created

    Player->>API: POST /api/games/:id/videos (notify complete)
    API->>Table: Create MediaSubmission record
    API->>Table: Add scenarioId to team.completedScenarios
    API-->>Player: 201 Success
```

### SAS Token Security

| Token Type | Purpose | Permissions | Expiry |
|------------|---------|-------------|--------|
| Upload | Player uploads media | Write only | 5 minutes |
| Download | View media in judging/gallery | Read only | 1 hour |

### CORS Configuration

Blob Storage CORS is configured programmatically on startup:

```typescript
{
  allowedOrigins: '*',  // Dev: all origins; Prod: restrict to domain
  allowedMethods: 'GET,HEAD,PUT,POST,DELETE,OPTIONS',
  allowedHeaders: '*',
  exposedHeaders: '*',
  maxAgeInSeconds: 3600
}
```

---

## Data Lifecycle

### Auto-Cleanup (7 Days)

Azure Blob Storage lifecycle policy automatically deletes media after 7 days:

```json
{
  "rules": [
    {
      "name": "DeleteOldMedia",
      "type": "Lifecycle",
      "definition": {
        "filters": {
          "blobTypes": ["blockBlob"],
          "prefixMatch": ["media/"]
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

Game keepers can delete a game immediately:
- `DELETE /api/games/:id` removes:
  - All blobs under `media/{gameId}/`
  - All Table Storage records (game, teams, mediasubmissions)

### What Gets Cleaned Up

| Data | Storage | Retention | Cleanup Method |
|------|---------|-----------|----------------|
| Photos/Videos | Blob | 7 days | Lifecycle policy + manual delete |
| Game records | Table | 7 days | Scheduled function (future) |
| Team records | Table | 7 days | Cascade from game delete |
| Submissions | Table | 7 days | Cascade from game delete |
| Scenarios | Table | Permanent | Never deleted |
| Game Keepers | Table | Permanent | Manual removal only |

---

## Cost Estimates

### Table Storage

- **Pricing**: $0.00036 per 10,000 transactions + $0.045/GB stored
- **Per game**: ~40 KB (1 game + 20 teams + 120 players + 20 scenario refs)
- **Monthly cost**: < $0.01 (thousands of games still under 1 MB)

### Blob Storage

- **Pricing**: $0.02/GB stored + $0.004 per 10,000 operations
- **Per game**: ~1.1 GB (200 photos @ 500KB + 200 videos @ 5MB)
- **Monthly cost**: $0.02 - $0.25 depending on usage

### Storage Summary

| Usage | Games/Month | Blob Storage | Table Storage | Total |
|-------|-------------|--------------|---------------|-------|
| Light (1-2 games) | 2 | ~2 GB = $0.04 | < $0.01 | ~$0.05 |
| Normal (4 games) | 4 | ~4 GB = $0.08 | < $0.01 | ~$0.10 |
| Heavy (10 games) | 10 | ~10 GB = $0.20 | < $0.01 | ~$0.25 |

*Note: 7-day lifecycle policy prevents storage accumulation.*

---

## Local Development

For local development, [Azurite](https://github.com/Azure/Azurite) emulates both Table and Blob storage:

```bash
# Start Azurite (all services)
azurite --location .azurite --blobPort 10000 --queuePort 10001 --tablePort 10002
```

Connection string: `UseDevelopmentStorage=true`

See [DEVELOPMENT.md](DEVELOPMENT.md) for full setup instructions.
