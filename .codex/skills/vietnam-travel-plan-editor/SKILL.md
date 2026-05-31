---
name: vietnam-travel-plan-editor
description: Use when editing, auditing, displaying, or automating Vietnam Travel Planner plans on prod or local environments, especially trips.naai.studio plan/session URLs, CLI/MCP setup, admin-vs-session plan writes, activity scheduling, activity cost configuration, hotel room pricing, adult/child ticket pricing, transport/food/accommodation activities, Vexere fare lookup, proximity analysis, or the repo CLI.
---

# Vietnam Travel Plan Editor

Use this skill when the user asks to modify, inspect, or automate a travel plan
in this repo or on `https://trips.naai.studio`. Prefer the project CLI or MCP
tools over raw HTTP calls unless debugging the API itself.

## Safety Rules

- Never write admin passwords, JWTs, or server secrets to tracked files, docs, commits, logs, or final replies.
- Prefer `TRAVEL_ADMIN_PASSWORD` in the shell environment for CLI admin writes.
- For MCP admin writes, pass `adminPassword` only as a tool argument for that call, or use `set_admin_password` for the current MCP session.
- If the user has no admin password, create/edit a session plan and return the `?session=...` share URL.
- Deploys must preserve DB data. Do not use deploy/migration to move local plan data to prod.
- Do not edit deprecated root `index.html`, root `vite.config.ts`, or `dev-server.ts`.

## Best Tool Choice

- Use MCP for external AI systems and interactive agents that support MCP.
- Use CLI for Codex/local automation, smoke tests, reproducible commands, and
  tools that do not support MCP.
- Use direct HTTP only when validating backend behavior or integrating a
  non-MCP/non-CLI client.

## Prod Defaults

- API/app URL: `https://trips.naai.studio`
- Main editable plan slug: `ha-noi-nghe-an-ninh-binh-ha-long-ha-noi`
- Admin UI: `https://trips.naai.studio/admin`
- MCP endpoint: `https://trips.naai.studio/mcp`

## CLI Quick Start

Run CLI commands from the repo root. Always pass `--api-url` when targeting
prod.

Read a sample/admin plan:

```bash
npm --prefix api run cli -- show-plan ha-noi-nghe-an-ninh-binh-ha-long-ha-noi \
  --api-url https://trips.naai.studio
```

For IDs and exact JSON:

```bash
npm --prefix api run cli -- get-plan ha-noi-nghe-an-ninh-binh-ha-long-ha-noi \
  --api-url https://trips.naai.studio
```

Create a user session plan with no admin password:

```bash
npm --prefix api run cli -- create-plan \
  --api-url https://trips.naai.studio \
  --public \
  --json '{"name":"My Trip","dateRange":"01/07/2026 - 05/07/2026"}'
```

Read a session plan after creation:

```bash
npm --prefix api run cli -- get-session-plan <sessionId> \
  --api-url https://trips.naai.studio
```

Edit an admin/sample plan only when the user supplies an admin password:

```bash
export TRAVEL_ADMIN_PASSWORD='...'
```

CLI writes use `/api/plans` with auth when a password is available. Without a
password, or with `--public`, writes use `/api/public/plans` and operate on a
session plan.

## CLI Commands

Plan commands:

```bash
npm --prefix api run cli -- list-plans --api-url https://trips.naai.studio
npm --prefix api run cli -- get-plan <slug> --api-url https://trips.naai.studio
npm --prefix api run cli -- show-plan <slug> --api-url https://trips.naai.studio
npm --prefix api run cli -- get-session-plan <sessionId> --api-url https://trips.naai.studio
npm --prefix api run cli -- create-plan --api-url https://trips.naai.studio --public --json '{"name":"Trip"}'
npm --prefix api run cli -- update-plan <slug> --api-url https://trips.naai.studio --json '{"name":"New name"}'
npm --prefix api run cli -- delete-plan <slug> --api-url https://trips.naai.studio
```

Location commands:

```bash
npm --prefix api run cli -- add-location <slug> \
  --api-url https://trips.naai.studio \
  --json '{"name":"Ninh Bình","province":"Ninh Bình","durationDays":2}'

npm --prefix api run cli -- update-location <slug> <locationId> \
  --api-url https://trips.naai.studio \
  --json '{"durationDays":2}'

npm --prefix api run cli -- reorder-locations <slug> \
  --api-url https://trips.naai.studio \
  --json '{"orderedIds":[3,1,2]}'
```

Activity commands:

```bash
npm --prefix api run cli -- add-activity <slug> <locationId> \
  --api-url https://trips.naai.studio \
  --json '{"name":"Hotel","activityType":"accommodation","pricingMode":"per_room","unitPrice":900000,"quantity":1,"surcharge":0,"durationDays":2}'

npm --prefix api run cli -- update-activity <slug> <locationId> <activityId> \
  --api-url https://trips.naai.studio \
  --json '{"adultPrice":250000,"childPrice":150000}'

npm --prefix api run cli -- reorder-activities <slug> <locationId> \
  --api-url https://trips.naai.studio \
  --json '{"orderedIds":[12,10,11],"schedules":[{"id":12,"scheduledDate":"2026-07-03","scheduledTime":"09:30"}]}'
```

`add-sub-location`, `update-sub-location`, `delete-sub-location`, and
`reorder-sub-locations` are aliases for the activity commands.

Planning read commands:

```bash
npm --prefix api run cli -- analyze-activities <slug> \
  --api-url https://trips.naai.studio \
  --format markdown

npm --prefix api run cli -- search-vexere-trips "Hà Nội" "Nghệ An" 2026-06-18 \
  --api-url https://trips.naai.studio \
  --format markdown
```

Always read the plan again after writes.

## MCP Editing Pattern

HTTP MCP server config:

```toml
[mcp_servers.vietnam-roadtrips]
url = "https://trips.naai.studio/mcp"
```

For prod/admin writes, include:

```json
{
  "adminPassword": "<provided at runtime>",
  "planSlug": "ha-noi-nghe-an-ninh-binh-ha-long-ha-noi"
}
```

Stdio MCP config can point to prod without storing the password:

```json
{
  "mcpServers": {
    "vietnam-travel-control": {
      "command": "npx",
      "args": ["tsx", "api/src/mcp.ts"],
      "env": {
        "REMOTE_API_URL": "https://trips.naai.studio"
      }
    }
  }
}
```

Then call `set_admin_password` in the MCP session before write tools.

Without an admin password, MCP writes create/update a user session plan and
return a `shareUrl` like `https://trips.naai.studio/?session=...`. Use that
`shareUrl` or `sessionId` in follow-up tools. With an admin password, pass
`adminPassword` and `planSlug` to edit the sample/admin plan directly.

Read-only MCP tools available for planning:

- `analyze_activity_proximity`: check nearby activities and transport blocks
  before adding or moving items.
- `search_vexere_trips`: check Vexere coach/bus fares, departure times, seat
  types, available seats, and operator ratings. Vexere credentials are kept on
  the app server; callers only provide `from`, `to`, `date`, and optional
  pagination/sort fields.

Full setup notes for other AI systems live in `docs/ai-integration.md`.

## Recommended AI Workflow

1. Identify target:
   - `?session=...` or `sessionId`: edit the user's session plan.
   - `?slug=...` with admin password: edit the sample/admin plan.
   - `?slug=...` without admin password: read the sample plan, then create a
     new session plan for user edits.
2. Read the plan with `get_plan` or CLI `get-plan`/`get-session-plan`.
3. Before scheduling new activities, run `analyze_activity_proximity` or CLI
   `analyze-activities` to group nearby activities and avoid bad day planning.
4. For coach/bus transport, run `search_vexere_trips` or CLI
   `search-vexere-trips`; then add/update a transport activity with the chosen
   fare and duration.
5. Write activity costs on activities, not legacy location-level cost fields.
6. Re-read the plan and report the share URL plus changed IDs.

## Cost Model

Cost details belong on activities (`sub_locations`), not fixed location fields.

- `activityType`: `sightseeing`, `accommodation`, `food`, `transport`, `other`
- `pricingMode`: `per_person`, `per_room`, `per_group`
- Hotels: use `activityType="accommodation"`, `pricingMode="per_room"`, `unitPrice` per room/night or stay unit, `quantity` for room/unit count, `surcharge` for fixed extra charges, default surcharge `0`, and `durationDays` for multi-day stay bars.
- Tickets: use adult/child prices with `pricingMode="per_person"`.
- Transport and meals should also be activities when they affect cost.
- For per-person activities, always set `participantAdults` and
  `participantChildren` on that activity. Location-level headcount is legacy
  storage and is not used for cost calculation.
- Location-level cost fields are legacy storage only. Configure costs as activities.
- Scheduling belongs on each activity. Use `scheduledDate` plus `scheduledTime`
  (`HH:mm`) for exact calendar placement. `scheduledPeriod` is legacy/UI helper
  metadata only; when both exist, UIs should trust `scheduledTime` and infer
  morning/afternoon/evening themselves.

## Activity JSON Cheat Sheet

Accommodation per room/night or stay unit:

```json
{
  "name": "Hotel",
  "activityType": "accommodation",
  "pricingMode": "per_room",
  "unitPrice": 900000,
  "quantity": 1,
  "surcharge": 0,
  "durationDays": 2,
  "scheduledDate": "2026-07-03",
  "scheduledTime": "15:00"
}
```

Sightseeing ticket:

```json
{
  "name": "Bảo tàng",
  "activityType": "sightseeing",
  "pricingMode": "per_person",
  "adultPrice": 250000,
  "childPrice": 150000,
  "durationMinutes": 90,
  "scheduledDate": "2026-07-03",
  "scheduledTime": "09:30"
}
```

Transport:

```json
{
  "name": "Xe khách Hà Nội -> Nghệ An",
  "activityType": "transport",
  "transportType": "bus",
  "pricingMode": "per_person",
  "adultPrice": 200000,
  "childPrice": 200000,
  "participantAdults": 6,
  "participantChildren": 2,
  "durationMinutes": 360,
  "scheduledDate": "2026-06-18",
  "scheduledTime": "07:00"
}
```

## Verification

After edits:

```bash
npm --prefix api run cli -- show-plan <slug> --api-url https://trips.naai.studio
curl -fsS https://trips.naai.studio/api/health
```

If source code changed, run:

```bash
npm --prefix api run build
npm --prefix admin run build
npm --prefix public run build
```
