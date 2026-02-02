# GitHub Copilot Instructions

## Local Development

For local testing setup, see [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md).

**Quick start (Windows ARM64):**
```powershell
.\start-dev.ps1
```

**Quick start (macOS/Linux/Windows x64):**
```bash
./start-dev.sh
```

## Commit Standards

- **Keep commit messages concise** - 3-5 bullet points max, ~5 words each
- Use short, action-oriented phrases (e.g., "Add player join flow" not "Added the player join flow with game code entry and team selection")
- Stage all related files together

## Code Quality

- Follow existing code patterns and style
- Test changes locally before committing
- Ensure TypeScript compiles without errors (`npm run build`)
