# AGENTS.md — AI Maintenance Guide

This document is written for AI coding assistants (Claude, Copilot, etc.) to understand the project architecture, conventions, and common tasks.

---

## Project Overview

**Vietnam Travel Planner** — full-stack web app, du lịch Việt Nam.

- Public visitors browse plans, see cost calculators, maps, print itineraries.
- Admin dashboard manages plans, locations, sub-locations.
- Express + SQLite backend serves the API and static builds in production.
- Docker image published to GHCR on every push to `main`.

**Single source of truth: SQLite DB.** Frontend fetches all data from `/api/plans`. No static JSON fallback.

---

## ⚠️ File nào để sửa

| Mục đích | File cần sửa |
|----------|-------------|
| **Public frontend** (UI, logic, CSS) | `public/index.html` |
| **Admin dashboard** | `admin/src/` |
| **Backend API** | `api/src/` |
| **DB seed data** | `plans.json` + `api/src/db/migrate.ts` |
| **Vite config cho public** | `public/vite.config.ts` |
| **Dev server config** | `public/vite.config.ts` (proxy) |

> **Không sửa root `index.html`** — đây là file cũ của GitHub Pages (deprecated), không được build vào Docker image.

---

## Repository Layout

```
.
├── public/                 # ✅ Alpine.js public frontend — FILE NÀY ĐI VÀO PRODUCTION
│   ├── index.html          # Single file: toàn bộ UI/logic inline (Alpine.js + Tailwind + Leaflet)
│   ├── favicon.svg
│   ├── vite.config.ts      # Build → ../dist/public; dev proxy /api → :7321
│   └── package.json        # "dev": vite --port 3000, "build": vite build
│
├── admin/                  # React + Vite admin dashboard
│   ├── src/
│   │   ├── api/client.ts       # All fetch() calls to /api/*
│   │   ├── types/index.ts      # TypeScript interfaces
│   │   └── components/locations/LocationEditor.tsx
│   ├── vite.config.ts      # Build → ../dist/admin; port 3002
│   └── package.json
│
├── api/                    # Express + SQLite backend (port 7321)
│   ├── src/
│   │   ├── index.ts            # Entry: runMigration(), mount routes, serve static (prod)
│   │   ├── db/
│   │   │   ├── connection.ts   # better-sqlite3 singleton
│   │   │   ├── schema.sql      # CREATE TABLE (auto-run on first connect)
│   │   │   └── migrate.ts      # Seed plans.json → DB + SUB_LOCATION_SEEDS
│   │   ├── routes/
│   │   │   ├── auth.ts         # POST /api/auth/login → JWT
│   │   │   ├── plans.ts        # CRUD plans, locations, sub_locations
│   │   │   ├── vexere.ts       # GET /api/vexere-link (optional)
│   │   │   └── health.ts       # GET /api/health
│   │   ├── services/planService.ts   # DB queries, snake_case → camelCase
│   │   └── middleware/auth.ts        # JWT verification
│   ├── travel.db           # Dev DB (gitignored)
│   └── package.json        # "dev": tsx watch, "build": tsc, port 7321
│
├── plans.json              # Seed data — dùng khi fresh deploy, KHÔNG phục vụ frontend
├── Dockerfile              # Multi-stage: build-admin → build-public → build-api → final
├── docker-compose.yml      # VPS: bind mount ./data:/data, DB at /data/travel.db
├── .env.example
├── .github/workflows/docker-image.yml   # Push to GHCR on push to main
├── DEPLOY.md               # Deploy runbook
│
├── index.html              # ❌ DEPRECATED — GitHub Pages static build cũ, bỏ qua
├── vite.config.ts          # ❌ DEPRECATED — config của root index.html cũ, bỏ qua
└── dev-server.ts           # ❌ DEPRECATED — monolithic dev server cũ, bỏ qua
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js 20, Express, better-sqlite3, jose (JWT) |
| Public frontend | Alpine.js 3, Tailwind CSS (CDN), Leaflet.js, OSRM routing |
| Admin dashboard | React 18, React Router 6, @dnd-kit, Tailwind CSS |
| Database | SQLite — `api/travel.db` (dev), `/data/travel.db` (prod) |
| Build | Vite (public + admin), tsc (api) |
| Container | Docker multi-stage, Compose bind mount |
| CI/CD | GitHub Actions → GHCR |

---

## Database Schema

```sql
plans          (id, slug, name, date_range)
locations      (id, plan_id, sort_order, name, province, lat, lng,
                arrive_at, depart_at, duration_days,
                transport_type, transport_label, transport_fare,
                accommodation_name, accommodation_url,
                adult_price, child_price,
                stay_cost_per_night, food_budget_per_day,
                adults, children, highlight, description, activities, food)
sub_locations  (id, location_id, sort_order, name, lat, lng,
                duration_minutes, description,
                adult_price, child_price)
```

- `activities`, `food` — JSON arrays stored as TEXT
- Monetary values — integers in VND
- `arrive_at`, `depart_at` — Unix milliseconds (nullable)

---

## Data Flow

### Frontend
1. `GET /api/plans` → list plans
2. `GET /api/plans/:slug` → full plan + locations + sub_locations
3. Không có fallback tĩnh — nếu API không chạy thì không có dữ liệu.

### Fresh deployment (empty DB)
1. `api/src/index.ts` → `runMigration()`
2. `runMigration()` đọc `plans.json` → insert plans + locations
3. `seedSubLocations()` — insert `SUB_LOCATION_SEEDS` nếu bảng rỗng

### Existing DB
- Migration skip nếu đã có data
- `seedSubLocations()` skip nếu đã có rows

---

## Dev Workflow

```bash
# Terminal 1 — API (BẮT BUỘC chạy trước)
cd api && npm run dev          # tsx watch, port 7321

# Terminal 2 — Admin dashboard
cd admin && npm run dev        # Vite, port 3002

# Terminal 3 — Public frontend
cd public && npm run dev       # Vite, port 3000 (proxy /api → :7321)
```

Truy cập:
- **Public**: http://localhost:3000
- **Admin**: http://localhost:3000/admin

**Không dùng** `npm run dev` ở root (đó là `dev-server.ts` cũ — deprecated).

---

## API Endpoints

```
POST   /api/auth/login                       { password } → { token }

GET    /api/plans                            → [{ slug, name, dateRange }]
GET    /api/plans/:slug                      → { slug, name, dateRange, locations[] }
POST   /api/plans                      🔒   create plan
PUT    /api/plans/:slug                🔒   update plan metadata

GET    /api/plans/:slug/locations            → locations[]
POST   /api/plans/:slug/locations      🔒   create location
PUT    /api/plans/:slug/locations/:id  🔒   update location
DELETE /api/plans/:slug/locations/:id  🔒   delete location
PATCH  /api/plans/:slug/locations/reorder 🔒

GET    /api/plans/:slug/locations/:id/sub-locations
POST   /api/plans/:slug/locations/:id/sub-locations   🔒
PUT    /api/plans/:slug/locations/:id/sub-locations/:sid 🔒
DELETE /api/plans/:slug/locations/:id/sub-locations/:sid 🔒

GET    /api/vexere-link?from=X&to=Y&date=YYYY-MM-DD
GET    /api/health
```

🔒 = `Authorization: Bearer <JWT>`

---

## Environment Variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `JWT_SECRET` | ✅ prod | `change-me-in-production` | Sign/verify JWT |
| `ADMIN_PASSWORD` | ✅ prod | `admin123` | Admin login |
| `DB_PATH` | | `./travel.db` | Absolute path preferred in Docker |
| `PORT` | | `7321` | API port |
| `VEXERE_USERNAME` | | — | Optional |
| `VEXERE_PASSWORD` | | — | Optional |
| `VEXERE_USE_UAT` | | `false` | Vexere test env |

---

## Docker & Deployment

### Docker build stages
```
build-admin   → cd admin   && npm run build → dist/admin/
build-public  → cd public  && npm run build → dist/public/
build-api     → cd api     && npm run build → dist/
final image   → api runtime + static/admin + static/public + plans.json
```

### Compose (VPS)
```yaml
volumes:
  - ./data:/data        # DB ở ./data/travel.db trên host
environment:
  - DB_PATH=/data/travel.db
```

### Deploy
```bash
# Code only
docker compose pull && docker compose up -d

# Có đổi data → xem DEPLOY.md
```

---

## Common Maintenance Tasks

### Thêm tourist spot (sub-location) vào prod DB

1. Thêm vào `SUB_LOCATION_SEEDS` trong `api/src/db/migrate.ts`
2. Insert thẳng vào prod DB:
   ```bash
   sqlite3 ./data/travel.db \
     "INSERT INTO sub_locations (location_id, sort_order, name, lat, lng, duration_minutes, description, adult_price, child_price)
      SELECT l.id, <sort>, '<name>', <lat>, <lng>, <min>, '<desc>', <adult>, <child>
      FROM locations l JOIN plans p ON l.plan_id = p.id
      WHERE p.slug = '<slug>' AND l.name = '<location>' LIMIT 1;"
   ```
3. Push code → CI build → `docker compose pull && docker compose up -d`

### Thêm plan mới

1. Thêm vào `plans.json` (unique `slug`)
2. Thêm seeds vào `SUB_LOCATION_SEEDS` trong `migrate.ts`
3. Push → CI build
4. VPS: dùng admin UI thêm, hoặc reset DB (xem DEPLOY.md)

### Reset DB

```bash
docker compose down
rm ./data/travel.db
docker compose up -d   # seed lại từ đầu
```

---

## Known Gotchas

- **Dev DB**: `api/travel.db`. Prod DB: `/data/travel.db` trong container. Root `travel.db` là artifact cũ — bỏ qua.
- **Hà Nội xuất hiện 2 lần** trong plan-1: sort_order=0 (xuất phát) và sort_order=5 (về). Seed dùng `ORDER BY l.id ASC LIMIT 1` — luôn trỏ vào entry đầu tiên.
- **`seedSubLocations()` all-or-nothing**: skip nếu đã có bất kỳ row nào. Thêm seed vào DB có sẵn phải INSERT thủ công.
- **`plans.json` chỉ là seed**: không phục vụ frontend. Frontend chỉ đọc từ API.
- **Admin dashboard** chạy tại `/admin` trong production, do Express server serve (không phải service riêng).
- **`./data/` phải tồn tại** trên host trước `docker compose up` lần đầu.
- **Root `index.html` / `dev-server.ts` / root `vite.config.ts`**: deprecated, không dùng, không sửa.
