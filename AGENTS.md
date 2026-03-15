# AGENTS.md — AI Maintenance Guide

This document is written for AI coding assistants (Claude, Copilot, etc.) to understand the project architecture, conventions, and common tasks.

---

## Project Overview

**Vietnam Travel Planner** is a full-stack web app for planning and sharing Vietnam travel itineraries.

- Public visitors browse plans, see cost calculators, maps, and print itineraries.
- An admin dashboard manages plans, locations, and sub-locations (tourist spots).
- The backend is a single Express + SQLite server that also serves static builds.
- Docker image is published to GHCR on every push to `main`.

---

## Repository Layout

```
.
├── api/                    # Express + SQLite backend (port 7321)
│   ├── src/
│   │   ├── index.ts        # Entry point: runs migration, mounts routes, serves static
│   │   ├── db/
│   │   │   ├── connection.ts   # better-sqlite3 singleton (DB_PATH env or ./travel.db)
│   │   │   ├── schema.sql      # CREATE TABLE statements (run on first connect)
│   │   │   └── migrate.ts      # Seeds plans.json → DB; seeds sub_locations on empty table
│   │   ├── routes/
│   │   │   ├── auth.ts         # POST /api/auth/login → JWT
│   │   │   ├── plans.ts        # CRUD for plans, locations, sub_locations
│   │   │   ├── vexere.ts       # GET /api/vexere-link (optional bus booking integration)
│   │   │   └── health.ts       # GET /api/health
│   │   ├── services/
│   │   │   └── planService.ts  # DB queries + shape transformation (snake_case → camelCase)
│   │   ├── middleware/
│   │   │   ├── auth.ts         # JWT verification middleware
│   │   │   └── errorHandler.ts
│   │   └── lib/
│   │       └── vexere.ts       # Vexere API client (inferTransportType, token fetch)
│   ├── package.json        # Scripts: dev (tsx watch), build (tsc), start (node dist/)
│   └── travel.db           # SQLite database (gitignored, dev only)
│
├── admin/                  # React + Vite admin dashboard (port 3002 in dev)
│   ├── src/
│   │   ├── api/client.ts   # All fetch() calls to /api/*
│   │   ├── types/index.ts  # TypeScript interfaces (Plan, Location, SubLocation…)
│   │   └── components/
│   │       └── locations/
│   │           └── LocationEditor.tsx  # Main location + sub-location editor UI
│   └── package.json        # build: tsc && vite build → dist/admin/
│
├── public/                 # Alpine.js public frontend (port 3000 in dev, Vite SPA)
│   └── index.html          # Single file: Alpine.js + Tailwind + Leaflet + all logic inline
│
├── plans.json              # Canonical seed data for both dev and prod fresh DBs
├── Dockerfile              # Multi-stage: build-admin → build-api → final image
├── docker-compose.yml      # Binds ./data:/data; DB lives at /data/travel.db in container
├── .env.example            # All supported env vars with defaults
├── .github/workflows/
│   └── docker-image.yml    # Push to GHCR on push to main / tags
└── DEPLOY.md               # Deployment runbook (data changes, VPS update steps)
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js 20, Express, better-sqlite3, jose (JWT), dotenv |
| Public frontend | Alpine.js 3, Tailwind CSS (CDN), Leaflet.js, OSRM routing |
| Admin dashboard | React 18, React Router 6, @dnd-kit, Leaflet, Tailwind CSS |
| Database | SQLite (single file) |
| Build | Vite (admin + public), tsc (api) |
| Container | Docker multi-stage, Compose bind mount |
| CI/CD | GitHub Actions → GHCR (ghcr.io) |

---

## Database Schema (key tables)

```sql
plans          (id, slug, name, date_range)
locations      (id, plan_id, sort_order, name, province, lat, lng,
                arrive_at, depart_at, duration_days,
                transport_type, transport_label, transport_fare,
                accommodation_name, accommodation_url,
                adult_price, child_price,        -- location entry ticket
                stay_cost_per_night, food_budget_per_day,
                adults, children, highlight, description, activities, food)
sub_locations  (id, location_id, sort_order, name, lat, lng,
                duration_minutes, description,
                adult_price, child_price)         -- tourist spot ticket price
```

- `activities` and `food` columns are JSON arrays stored as TEXT.
- All monetary values are integers in VND.
- `arrive_at` / `depart_at` are Unix milliseconds (nullable).

---

## Data Flow

### Fresh deployment (empty DB)
1. `api/src/index.ts` calls `runMigration()` on startup.
2. `runMigration()` reads `plans.json` → inserts plans + locations.
3. `runMigration()` then calls `seedSubLocations()`.
4. `seedSubLocations()` checks `sub_locations` row count; if zero, inserts all entries from `SUB_LOCATION_SEEDS` using slug+name subqueries (no hardcoded IDs).

### Existing DB (subsequent starts)
- Migration skips plan/location insert (row count > 0).
- `seedSubLocations()` still runs but short-circuits if rows already exist.

### Adding new seed data
- Add entries to `SUB_LOCATION_SEEDS` array in `api/src/db/migrate.ts`.
- For live dev DB: run inserts directly with `node` + `better-sqlite3` (see DEPLOY.md).
- For prod: the seed only auto-applies on a **fresh** DB. For existing prod DBs, run the SQL manually or reset the DB.

---

## Cost Calculation (public frontend)

`calculateLocationCost(loc, adults, children)` in `public/index.html`:

```
total = (loc.adultPrice × adults + loc.childPrice × children)  // location entry
      + loc.stayCostPerNight × loc.duration
      + loc.foodBudgetPerDay × loc.duration × (adults + children)
      + loc.transportFare
      + sum(loc.attractions[].adultPrice × adults + childPrice × children)  // static JSON
      + sum(loc.subLocations[].adultPrice × adults + childPrice × children) // from API/DB
```

- `loc.attractions` — static array in `plans.json` (used as fallback on GitHub Pages where there is no API).
- `loc.subLocations` — fetched from `/api/plans/:slug` (DB-managed, shown in admin).
- Both sources add to the same total; don't double-populate the same spots in both.

---

## API Endpoints

```
POST   /api/auth/login                    { password } → { token }

GET    /api/plans                         → [{ slug, name, dateRange, locations[] }]
GET    /api/plans/:slug                   → { slug, name, dateRange, locations[] }
POST   /api/plans                   🔒   create plan
PUT    /api/plans/:slug             🔒   update plan metadata

GET    /api/plans/:slug/locations         → locations[]
POST   /api/plans/:slug/locations   🔒   create location
PUT    /api/plans/:slug/locations/:id 🔒 update location
DELETE /api/plans/:slug/locations/:id 🔒 delete location
PATCH  /api/plans/:slug/locations/reorder 🔒

GET    /api/plans/:slug/locations/:id/sub-locations
POST   /api/plans/:slug/locations/:id/sub-locations 🔒
PUT    /api/plans/:slug/locations/:id/sub-locations/:sid 🔒
DELETE /api/plans/:slug/locations/:id/sub-locations/:sid 🔒

GET    /api/vexere-link?from=X&to=Y&date=YYYY-MM-DD
GET    /api/health
```

🔒 = requires `Authorization: Bearer <JWT>` header.

---

## Dev Workflow

```bash
# Terminal 1 – API
cd api && npm run dev          # tsx watch, hot-reload, port 7321

# Terminal 2 – Admin
cd admin && npm run dev        # Vite dev server, port 3002

# Terminal 3 – Public
cd public && npm run dev       # Vite dev server, port 3000 (proxies /api → :7321)
```

Vite proxy config (`public/vite.config.ts`): `/api` → `http://localhost:7321`.

The API uses `api/travel.db` (relative to `api/` working directory). Root `travel.db` is a stale artifact—ignore it.

---

## Environment Variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `JWT_SECRET` | ✅ prod | `change-me-in-production` | Sign/verify admin JWT |
| `ADMIN_PASSWORD` | ✅ prod | `admin123` | Admin login password |
| `DB_PATH` | | `./travel.db` | Absolute path preferred in Docker |
| `PORT` | | `7321` | API listen port |
| `VEXERE_USERNAME` | | — | Optional bus booking |
| `VEXERE_PASSWORD` | | — | Optional bus booking |
| `VEXERE_USE_UAT` | | `false` | Vexere test environment |

---

## Docker & Deployment

### Image
- Built by GitHub Actions on every push to `main`.
- Published to `ghcr.io/<owner>/vietnam-travel` with tags: `main`, `sha-<hash>`, `latest`.
- Platform: `linux/amd64`.

### Compose (VPS)
```yaml
volumes:
  - ./data:/data        # bind mount — DB lives at ./data/travel.db on host
environment:
  - DB_PATH=/data/travel.db
```

### VPS update (code change only)
```bash
docker compose pull && docker compose up -d
```

### VPS update (with DB data change)
See `DEPLOY.md` for the full runbook.

---

## Common Maintenance Tasks

### Add a new tourist spot (sub-location) to existing prod DB

1. Add entry to `SUB_LOCATION_SEEDS` in `api/src/db/migrate.ts` (for future fresh deploys).
2. SSH to VPS and run the INSERT directly:
   ```bash
   sqlite3 ./data/travel.db \
     "INSERT INTO sub_locations (location_id, sort_order, name, lat, lng, duration_minutes, description, adult_price, child_price)
      SELECT l.id, <sort>, '<name>', <lat>, <lng>, <min>, '<desc>', <adult>, <child>
      FROM locations l JOIN plans p ON l.plan_id = p.id
      WHERE p.slug = '<plan-slug>' AND l.name = '<location-name>' LIMIT 1;"
   ```
3. Commit the migrate.ts change and push → CI builds new image.
4. VPS: `docker compose pull && docker compose up -d`.

### Add a new plan

1. Add the plan object to `plans.json` with a unique `slug`.
2. Add seed sub-locations to `SUB_LOCATION_SEEDS` in `migrate.ts`.
3. Push to `main` → CI builds image.
4. On VPS with existing DB: use admin dashboard to add the plan via UI, OR reset the DB.

### Reset DB (wipe and re-seed from plans.json + seeds)

```bash
# VPS
docker compose down
rm ./data/travel.db
docker compose up -d   # fresh migration runs on startup
```

---

## Known Gotchas

- **Two DB files**: `./travel.db` (project root, stale/unused) and `./api/travel.db` (active dev DB). Always work with `api/travel.db` in dev.
- **Hà Nội appears twice in plan-1**: sort_order=0 (departure, no sub-locs) and sort_order=5 (return, 3 sub-locs). The seed uses `ORDER BY l.id ASC LIMIT 1` so it always targets the first match by ID — verify which Hà Nội you intend.
- **`seedSubLocations()` skips if any rows exist**: it's all-or-nothing. If you need to add seeds to an existing DB, insert rows directly.
- **Static `attractions` in plans.json vs DB `sub_locations`**: `attractions` exists for the GitHub Pages static build (no API). Don't duplicate entries between `attractions` and `SUB_LOCATION_SEEDS`.
- **Admin dashboard** is served at `/admin` in production by the Express server (not a separate service).
- **Docker bind mount**: `./data/` must exist on the host before first `docker compose up`. CI/deploy step creates it.
