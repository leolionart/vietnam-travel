# AGENTS.md - AI Maintenance Guide

This document is for AI coding assistants working on Vietnam Travel Planner.

## Project Overview

- Public visitors browse plans, maps, calendars, and cost summaries.
- Admin dashboard manages plans, locations, and activities.
- Express + SQLite backend serves the API and static builds in production.
- Docker image is published to GHCR on push to `main`.

**SQLite is the source of truth per environment.** Frontend fetches data from
`/api/plans`. There is no static JSON fallback and deploy must not copy data
between environments.

## File Ownership

| Purpose | Files |
|---|---|
| Public frontend | `public/index.html` |
| Admin dashboard | `admin/src/` |
| Backend API | `api/src/` |
| Schema migration | `api/src/db/schema.sql`, `api/src/db/migrate.ts` |
| Public Vite config | `public/vite.config.ts` |

Do not edit deprecated root `index.html`, root `vite.config.ts`, or
`dev-server.ts` for production behavior.

## Data Boundary

- Prod data lives in prod SQLite (`/data/travel.db` in Docker).
- Dev data lives in local SQLite (`DB_PATH` or local default).
- Update data through Admin/CLI/MCP against the target environment.
- Do not put trip data into migrations, deploy scripts, or source files to move
  it from dev to prod.
- `runMigration()` only performs idempotent schema upgrades.

## Repository Layout

```
.
├── public/                 # Alpine.js public frontend
├── admin/                  # React admin dashboard
├── api/                    # Express + SQLite backend
│   └── src/db/migrate.ts   # Schema-only migration
├── Dockerfile              # Multi-stage production image
├── docker-compose.yml      # VPS bind mount ./data:/data
├── docs/deploy.md          # Deploy runbook
├── index.html              # Deprecated
├── vite.config.ts          # Deprecated
└── dev-server.ts           # Deprecated
```

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Node.js 20, Express, better-sqlite3, jose |
| Public frontend | Alpine.js 3, Tailwind CDN, Leaflet |
| Admin dashboard | React 18, React Router 6, @dnd-kit, Tailwind |
| Database | SQLite |
| Build | Vite + tsc |

## Dev Workflow

```bash
# Terminal 1
cd api && npm run dev

# Terminal 2
cd admin && npm run dev

# Terminal 3
cd public && npm run dev
```

Public: http://localhost:3000
Admin: http://localhost:3000/admin

## Deploy

```bash
cd ~/vietnam-travel
./scripts/redeploy.sh
```

Deploy keeps the existing DB. To change plan data, use Admin/CLI/MCP for the
target environment. To replace a whole environment DB, do an explicit SQLite
backup/restore outside the deploy path.

## Cost Model

Costs belong on activities (`sub_locations`):

- `activityType`: `sightseeing`, `accommodation`, `food`, `transport`, `other`
- `pricingMode`: `per_person`, `per_room`, `per_group`
- `unitPrice`, `quantity`, `surcharge`, `adultPrice`, `childPrice`

Location-level cost columns are legacy storage only and should not be used for
new UI, MCP, or admin workflows.

## Known Gotchas

- `api/travel.db` / root `travel.db` may be local artifacts; prod DB is
  `/data/travel.db` in Docker.
- Calendar and cost UI should treat activities as the source of truth.
- Public route paths `/map`, `/calendar`, and `/month` should remain stable.
