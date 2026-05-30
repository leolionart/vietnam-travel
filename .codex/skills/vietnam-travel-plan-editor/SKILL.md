---
name: vietnam-travel-plan-editor
description: Use when editing, auditing, or displaying existing Vietnam Travel Planner plans on prod or local environments, especially trips.naai.studio plan slugs, activity cost configuration, hotel room pricing, adult/child ticket pricing, transport/food/accommodation activities, MCP tools, or the repo CLI.
---

# Vietnam Travel Plan Editor

Use this skill when the user asks to modify or inspect a travel plan in this repo or on `https://trips.naai.studio`.

## Safety Rules

- Never write admin passwords, JWTs, or server secrets to tracked files, docs, commits, logs, or final replies.
- Prefer `TRAVEL_ADMIN_PASSWORD` in the shell environment for CLI writes.
- For MCP writes, pass `adminPassword` only as a tool argument for that call, or use `set_admin_password` for the current MCP session.
- Use `--keep-db` when deploying code-only changes to prod so existing plan data is preserved.
- Do not edit deprecated root `index.html`, root `vite.config.ts`, or `dev-server.ts`.

## Prod Defaults

- API/app URL: `https://trips.naai.studio`
- Main editable plan slug: `ha-noi-nghe-an-ninh-binh-ha-long-ha-noi`
- Admin UI: `https://trips.naai.studio/admin`
- MCP endpoint: `https://trips.naai.studio/mcp`

## Read A Plan

From repo root:

```bash
npm --prefix api run cli -- show-plan ha-noi-nghe-an-ninh-binh-ha-long-ha-noi \
  --api-url https://trips.naai.studio
```

For IDs and exact JSON:

```bash
npm --prefix api run cli -- get-plan ha-noi-nghe-an-ninh-binh-ha-long-ha-noi \
  --api-url https://trips.naai.studio
```

## Edit Existing Prod Plan With CLI

Before write commands, set the password in the current shell only:

```bash
export TRAVEL_ADMIN_PASSWORD='...'
```

Common commands:

```bash
npm --prefix api run cli -- update-location <slug> <locationId> \
  --api-url https://trips.naai.studio \
  --json '{"durationDays":2}'

npm --prefix api run cli -- add-activity <slug> <locationId> \
  --api-url https://trips.naai.studio \
  --json '{"name":"Hotel","activityType":"accommodation","pricingMode":"per_room","unitPrice":900000,"quantity":1,"surcharge":0,"durationDays":2}'

npm --prefix api run cli -- update-activity <slug> <locationId> <activityId> \
  --api-url https://trips.naai.studio \
  --json '{"adultPrice":250000,"childPrice":150000}'
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

## Cost Model

Cost details belong on activities (`sub_locations`), not fixed location fields.

- `activityType`: `sightseeing`, `accommodation`, `food`, `transport`, `other`
- `pricingMode`: `per_person`, `per_room`, `per_group`
- Hotels: use `activityType="accommodation"`, `pricingMode="per_room"`, `unitPrice` per room/night or stay unit, `quantity` for room count, `surcharge` for child/extra charges, default surcharge `0`, and `durationDays` for multi-day stay bars.
- Tickets: use adult/child prices with `pricingMode="per_person"`.
- Transport and meals should also be activities when they affect cost.
- Location-level cost fields are legacy/summary only.

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
