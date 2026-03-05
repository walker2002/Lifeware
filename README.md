# Lifeware - Personal Life Management System

A comprehensive life management system built with Next.js and Drizzle ORM, following the Nexus architecture pattern.

## Project Structure

```
lifeware/
├── frontend/                 # Next.js application (MVP)
│   ├── src/
│   │   ├── nexus/           # Nexus layer (system core)
│   │   │   ├── core/        # Core components
│   │   │   │   ├── intent-engine/
│   │   │   │   ├── rule-engine/
│   │   │   │   ├── state-machine/
│   │   │   │   └── action-surface-engine/
│   │   │   ├── infrastructure/  # Infrastructure components
│   │   │   │   ├── event-bus/
│   │   │   │   ├── memory-framework/
│   │   │   │   └── connector-runner/
│   │   │   └── orchestrator/  # Process orchestrator
│   │   ├── domains/         # Domain plugins
│   │   │   ├── tasks/
│   │   │   ├── habits/
│   │   │   ├── timebox/
│   │   │   ├── okrs/
│   │   │   └── review/
│   │   ├── usom/            # Unified Semantic & Object Model
│   │   ├── lib/             # Utilities and services
│   │   │   ├── db/          # Database configuration
│   │   ├── components/      # UI components
│   │   │   ├── ui/         # Base UI components
│   │   │   ├── layout/     # Layout components
│   │   │   └── domains/    # Domain-specific components
│   │   └── types/          # TypeScript type definitions
│   ├── drizzle.config.ts   # Drizzle ORM configuration
│   └── scripts/            # Database scripts
├── backend/                 # Backend services (future phase)
├── document/               # Project documentation
├── docker-compose.yml      # Docker configuration
└── postgres_data/          # PostgreSQL data directory
```

## Architecture Overview

Lifeware follows a layered architecture:

1. **USOM (Unified Semantic & Object Model)** - The common language layer defining object structures
2. **Nexus** - The core engine coordinating all system interactions
3. **Domain Plugins** - Extensible domain-specific logic
4. **Connector Layer** - External system integration (future phase)

## Technology Stack (MVP Phase)

- **Frontend**: Next.js 14 with TypeScript
- **UI**: Tailwind CSS + shadcn/ui + dnd-kit
- **Database**: PostgreSQL (via Supabase) with Drizzle ORM
- **AI**: LangGraph/LangChain (planned)
- **Rules Engine**: goRules (planned)

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd lifeware
```

2. Install frontend dependencies
```bash
cd frontend
npm install
```

3. Set up environment variables
```bash
cp .env.local.example .env.local
# Edit .env.local with your database URL and other secrets
```

4. Run database migrations
```bash
npm run db:migrate
```

5. Start the development server
```bash
npm run dev
```

### Database Setup

For MVP, you'll need a PostgreSQL database. You can:

1. Use Supabase (recommended for MVP)
   - Create a new project
   - Get the database URL from the project settings
   - Add it to your `.env.local`

2. Use a local PostgreSQL instance
   - Install PostgreSQL locally
   - Create a database named `lifeware`
   - Update the DATABASE_URL in `.env.local`

## Key Components

### Nexus Layer

The Nexus is the system's runtime core with four main components:

- **Intent Engine**: Parses user input and clarifies intent
- **Rule Engine**: Validates proposals and detects conflicts
- **State Machine**: Manages object lifecycles
- **Action Surface Engine**: Determines what actions to show the user

### Domain Plugins

Each domain implements a standard interface with four hooks:

1. `onValidate()` - Validates intent proposals
2. `onEvent()` - Responds to system events
3. `onActionSurfaceRequest()` - Provides action candidates
4. `onOutboundRequest()` - Declares outbound pushes (optional)

### USOM Objects

Core objects include:
- **Tasks**: Manageable units of work
- **Habits**: Trackable routines
- **TimeBoxes**: Timed activities
- **OKRs**: Objectives and Key Results
- **Reviews**: Reflection and learning

## Development Guidelines

### Repository Pattern
Always depend on repository interfaces, not concrete implementations:

```typescript
class MyComponent {
  constructor(private taskRepo: ITaskRepository) {}
}
```

### USOM Only
Components only receive USOM snapshots (read-only), never database objects.

### No Business Logic in UI
UI components should only handle presentation, not business logic.

## Future Phases

- **Phase 2**: Local-first with SQLite WASM + PowerSync
- **Phase 3**: React Native mobile app
- **Phase 4**: Advanced optimizations and E2E encryption

## Documentation

See the `document/` directory for detailed architecture specifications and technical decisions.

## License

[License information TBD]