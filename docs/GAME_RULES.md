# Game Rules

This document explains how Video Scavenger Hunt works, from setup to final scoring.

---

## Getting Started

### Basic Flow

1. **Game Keeper creates a game** - Selects scenarios, sets time limit, gets a 4-letter game code
2. **Players join** - Enter the game code, pick or create a team, enter a display name
3. **Game starts** - Timer begins, teams race to complete scenarios
4. **Time's up** - No more uploads accepted
5. **Judging** - Game Keeper reviews all submissions and awards bonus points
6. **Results** - Final scores revealed dramatically, winner announced

### Quick Reference

| Setting | Default | Options |
|---------|---------|---------|
| Scenarios | 10 | 10, 15, or 20 |
| Time Limit | 60 minutes | Configurable (typically 6 min per scenario) |
| Team Size | 2-6 members | Includes both players and crew |
| Teams per Game | 2-20 | Minimum 2 teams to start |
| Video Length | 30 seconds max | Enforced by app |

---

## Roles

### Game Keeper

The Game Keeper is the host who manages the game session:
- Creates the game and configures settings
- Shares the game code with players
- Starts the game when ready
- Can pause/resume or end the game early
- Reviews all submissions during judging
- Awards bonus points
- Only authorized users (email allowlist) can be Game Keepers

### Players

Players are team members with phones who can:
- Join via game code
- Create or join teams
- Record and upload photos/videos
- Add crew members to their team

### Crew Members

Crew members are team participants without their own device:
- Added by a player on their team
- Count toward the 6-member team limit
- Cannot upload media (they help with scenarios in person)
- Visible in team roster to everyone

---

## Teams

### Creating and Joining Teams

- **In Lobby**: Players can create new teams or join existing ones
- **After Game Starts**: Players can only join existing teams with open slots
- **Team Names**: Maximum 20 characters, duplicates allowed
- **Team Colors**: Automatically assigned from an 8-color palette

### Team Size Limits

- **Minimum**: 1 player per team
- **Maximum**: 6 members (players + crew combined)
- **Empty Teams**: Automatically deleted when game starts

### Late Joining

| Game Status | Can Join? | Notes |
|-------------|-----------|-------|
| Lobby | ✅ Yes | Create new team or join existing |
| Active | ✅ Yes | Join existing teams only (no new teams) |
| Paused | ✅ Yes | Same as active |
| Judging | ❌ No | Game has ended |
| Complete | ❌ No | Game has ended |

---

## Scenarios

### Types

Each scenario requires either:
- **📷 Photo** - Capture a single image
- **🎬 Video** - Record up to 30 seconds

### Categories

Scenarios are organized into categories for game setup:
- **Location** - Require going to specific places (gas station, playground, etc.)
- **General** - Can be done anywhere
- **Church** - Church-related activities

### Completion

- All teams get the same set of scenarios
- Teams can complete scenarios in any order
- Each scenario can only be completed once per team
- The first successful upload locks that scenario for the team

---

## Time & Pacing

### Timer

- Countdown timer visible to all players
- Color changes as time runs low:
  - 🟢 **Green**: More than 10 minutes remaining
  - 🟡 **Yellow**: 10 minutes or less
  - 🔴 **Red**: 1 minute or less

### Pause/Resume

The Game Keeper can pause the game at any time:
- Timer freezes for all players
- Players see a "Game Paused" overlay
- No uploads accepted while paused
- When resumed, timer continues from where it stopped

### Time Limit Adjustments

The Game Keeper can extend time during the game:
- Add 5, 10, or 15 minutes
- Useful if teams need more time

### Grace Period

When time expires:
- Uploads that were in progress may complete
- New uploads are rejected
- Players see "Time's Up!" message

---

## Media Capture

### Video Recording

- Maximum length: **30 seconds**
- App auto-stops recording at 30 seconds
- Preview before upload (re-record if needed)
- Once uploaded, cannot be changed

### Photo Capture

- Single image capture
- Preview before upload
- Uses device camera (rear preferred)

### Upload

- Direct upload to Azure Blob Storage
- Progress indicator shown
- Auto-retry on failure (up to 3 attempts)
- First successful upload wins (no duplicates)

### Fallback

If camera access is denied:
- Option to upload from camera roll
- Same validation rules apply

---

## Scoring

### Points System

| Action | Points |
|--------|--------|
| Complete a scenario | **1 point** |
| Receive bonus for a scenario | **1 bonus point** |

### Bonus Points

- One bonus point available per scenario
- Awarded by Game Keeper during judging
- Based on creativity, humor, or best execution
- Game Keeper can change bonus selection until judging ends

### Score Calculation

```
Total Score = Completed Scenarios + Bonus Points Earned
```

### Example

| Team | Completed | Bonuses | Total |
|------|-----------|---------|-------|
| Blue Team | 8 scenarios | 3 bonuses | 11 points |
| Red Team | 10 scenarios | 1 bonus | 11 points |
| Green Team | 7 scenarios | 2 bonuses | 9 points |

---

## Tie Breaking

When teams have the same total score:

1. **Primary**: Higher total score wins
2. **Tiebreaker**: More bonus points wins

If teams have identical scores AND identical bonus counts:
- Both teams share the same position
- Displayed as a tie (e.g., "1st Place: Blue Team & Red Team")

### Tie Example

| Team | Score | Bonuses | Position |
|------|-------|---------|----------|
| Blue Team | 11 | 3 | 🥇 1st |
| Red Team | 11 | 1 | 🥈 2nd |
| Green Team | 9 | 2 | 🥉 3rd |

Blue Team wins tiebreaker with more bonuses.

---

## Game Phases

### 1. Lobby

- Players join and form teams
- Game Keeper waits for teams to be ready
- Minimum requirement: 2 teams with at least 1 player each
- Game Keeper clicks "Start Game" when ready

### 2. Active

- Timer running
- Teams capturing and uploading media
- Live scoreboard shows completion counts
- Players can still join existing teams

### 3. Paused (Optional)

- Timer frozen
- Game Keeper paused the action
- Can be resumed at any time

### 4. Judging

- Time has expired or Game Keeper ended early
- Game Keeper reviews submissions scenario by scenario
- Bonus points awarded
- Players see "Judging in progress" screen

### 5. Revealing

- Game Keeper finished judging
- Teams revealed one by one (worst to best)
- Dramatic 2-second delay between reveals
- Skip option available

### 6. Complete

- All results visible
- Winner announced
- Media gallery available for download
- Game Keeper can start a new game

---

## Game Keeper Controls

### During Lobby

| Action | Effect |
|--------|--------|
| Start Game | Begin the timer, lock team creation |
| Share Code | Display game code and QR for players |

### During Game

| Action | Effect |
|--------|--------|
| Pause | Freeze timer, prevent uploads |
| Resume | Continue timer from where it stopped |
| End Game | Skip to judging phase immediately |
| Extend Time | Add 5/10/15 minutes to timer |

### During Judging

| Action | Effect |
|--------|--------|
| Navigate Scenarios | View each scenario's submissions |
| Award Bonus | Select one team per scenario for bonus point |
| Change Bonus | Can re-select until "Finish Judging" |
| Disqualify | Mark a submission as disqualified (no points) |
| Finish Judging | Proceed to reveal |

### After Game

| Action | Effect |
|--------|--------|
| View Gallery | Browse all team submissions |
| Download Media | Save photos/videos locally |
| New Game | Create another game |
| Delete Game | Remove game and all media |

---

## Technical Rules

### Game Code Format

- 4 uppercase letters (A-Z, excluding O and I to avoid confusion)
- Case-insensitive input (converted to uppercase)
- Valid for 7 days after game ends
- 331,776 possible combinations

### Video Retention

- All media auto-deleted after **7 days**
- Game Keeper can manually delete sooner
- Download media before expiration to keep it

### Session Persistence

- Player session stored in browser
- Page refresh restores position in game
- Different device requires rejoining
- Cleared when game is deleted

---

## Quick Rules Summary

1. ⏱️ Complete as many scenarios as possible before time runs out
2. 📸 Each scenario is photo OR video (follow the icon)
3. 🎬 Videos are max 30 seconds
4. 🏆 1 point per completion + 1 possible bonus point per scenario
5. 🥇 Highest total score wins; bonus count breaks ties
6. 👥 Teams of 2-6 people (players + crew)
7. 📱 Late players can join teams already in progress
8. ⏸️ Game Keeper can pause at any time
9. 🗑️ All media deleted after 7 days
