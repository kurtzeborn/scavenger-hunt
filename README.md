# Video Scavenger Hunt

A multiplayer video scavenger hunt game where teams compete to act out scenarios and capture them on video. A game keeper manages the session and reviews submissions at the end.

**Production URL**: https://vsh.k61.dev  
**Project Plan**: [docs/plan.md](docs/plan.md)  
**Local Development**: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

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
    ├── plan.md                   # Full project plan with API docs
    └── DEVELOPMENT.md            # Local dev setup guide
```

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Font Awesome
- **Backend**: Azure Functions (Node.js 20, TypeScript)
- **Database**: Azure Table Storage
- **Media Storage**: Azure Blob Storage
- **Auth**: Azure Entra ID (via Static Web Apps)
- **Hosting**: Azure Static Web Apps

## License

Private project - © Scott Kurtzeborn
