# AI Integration Guide

This project exposes the admin plan model through HTTP MCP and CLI so external
AI systems can inspect and edit travel plans without direct database access.

## Production Endpoints

- Public app: `https://trips.naai.studio`
- MCP endpoint: `https://trips.naai.studio/mcp`
- Public plan URL: `https://trips.naai.studio/?slug=<slug>`
- Session plan URL: `https://trips.naai.studio/?session=<sessionId>`

## MCP Setup

HTTP MCP clients can connect directly:

```toml
[mcp_servers.vietnam-roadtrips]
url = "https://trips.naai.studio/mcp"
```

Stdio MCP clients can proxy to production:

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

Do not store admin passwords in config. If a user has admin permission, pass
`adminPassword` only in the tool call or call `set_admin_password` for the
current MCP session.

## Editing Modes

- No admin password: `create_plan` creates a session plan and returns
  `shareUrl` with `?session=...`. Follow-up write tools should pass
  `shareUrl` or `sessionId`.
- With admin password: write tools can edit admin/sample plans by passing
  `adminPassword` and `planSlug`.
- Read-only tools do not need an admin password.

## Core MCP Tools

- `list_plans`
- `get_plan`
- `create_plan`, `update_plan`, `delete_plan`
- `add_location`, `update_location`, `delete_location`, `reorder_locations`
- `add_sub_location`, `update_sub_location`, `delete_sub_location`,
  `reorder_sub_locations`
- `analyze_activity_proximity`
- `search_vexere_trips`

## Vexere Search

Use `search_vexere_trips` to check coach/bus fare and availability. Vexere
credentials stay on the app server; callers only provide route parameters:

```json
{
  "from": "Hà Nội",
  "to": "Nghệ An",
  "date": "2026-06-18",
  "page": 1,
  "pageSize": 5,
  "sort": "fare:asc"
}
```

The tool returns operator name, departure time, price, seat type, available
seats, rating, and pagination metadata.

## CLI Setup

Read sample plans:

```bash
npm --prefix api run cli -- show-plan ha-noi-nghe-an-ninh-binh-ha-long-ha-noi \
  --api-url https://trips.naai.studio
```

Create a session plan without admin credentials:

```bash
npm --prefix api run cli -- create-plan \
  --api-url https://trips.naai.studio \
  --public \
  --json '{"name":"My Trip","dateRange":"01/07/2026 - 05/07/2026"}'
```

Edit an admin/sample plan only when the user supplies an admin password in the
shell environment:

```bash
export TRAVEL_ADMIN_PASSWORD='...'
npm --prefix api run cli -- update-activity <slug> <locationId> <activityId> \
  --api-url https://trips.naai.studio \
  --json '{"unitPrice":250000}'
```

Search Vexere from CLI:

```bash
npm --prefix api run cli -- search-vexere-trips "Hà Nội" "Nghệ An" 2026-06-18 \
  --api-url https://trips.naai.studio \
  --format markdown
```

## Data Rules

- Costs belong on activities (`sub_locations`), not location-level legacy cost
  columns.
- Per-person activities inherit `location.adults` and `location.children` by
  default. When group size changes for a single activity or date range, set
  `participantAdults` and `participantChildren` on that activity.
- Use `activityType="transport"` and `transportType="bus"` for coach/bus
  transport activities that should show transport icons and duration.
- Use `analyze_activity_proximity` before adding or moving activities so close
  activities can be grouped into the same day or same period.
- Do not move local SQLite data to production through deploy. Edit the target
  environment through Admin, CLI, or MCP.
