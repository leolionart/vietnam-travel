# Vietnam Roadtrips — Visual travel planner powered by AI

> Chat with your AI. Get a shareable link. No login. No friction.

**[trips.naai.studio](https://trips.naai.studio)**

---

## The idea

Western travel culture loves roadtrips — hopping between towns, experiencing local food, sleeping somewhere new every night. Vietnam is *perfect* for this: the country stretches 1,650 km from north to south, packed with distinct provinces, each with its own cuisine, landscapes, and rhythm.

Most AIs can plan a great multi-stop Vietnam itinerary — but the output is a wall of text. **Vietnam Roadtrips** gives that plan a visual home: an interactive timeline with a live map, estimated time at each attraction, transport between stops, food recommendations, and cost estimates. All rendered beautifully from a single shareable link.

The workflow is simple:

1. Attach the MCP to your AI (Claude, Cursor, or anything that supports MCP)
2. Tell your AI to plan a trip and push it to the app
3. Get a link — share it with whoever's coming

---

## Quick start — Add MCP to your AI

**Step 1** — Clone the repo (one-time):

```bash
git clone https://github.com/leolionart/vietnam-travel.git
cd vietnam-travel/api && npm install
```

**Step 2** — Add the MCP config to your AI client.

### Claude Code

`~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vietnam-roadtrips": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/vietnam-travel/api/src/mcp.ts"],
      "env": {
        "REMOTE_API_URL": "https://trips.naai.studio"
      }
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "vietnam-roadtrips": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/vietnam-travel/api/src/mcp.ts"],
      "env": {
        "REMOTE_API_URL": "https://trips.naai.studio"
      }
    }
  }
}
```

> Replace `/absolute/path/to/vietnam-travel` with the actual path on your machine (e.g. `/Users/yourname/vietnam-travel`).

> No `ADMIN_PASSWORD` needed. Plans you create are session-isolated — they don't appear in the main site listing and are only accessible via your unique share link.

---

## Try it now

Once the MCP is connected, paste this into your AI:

```
Plan a 7-day Vietnam roadtrip from Hanoi heading south: Ninh Binh (2 nights),
Phong Nha (2 nights), Hue (1 night), Da Nang (2 nights). Group of 2 adults.
End of April 2026.

For each stop: add the top 3–4 attractions with estimated visit duration and
ticket prices, local food specialties, rough accommodation budget per night,
and transport from the previous stop (bus/train, estimated fare and travel time).

Use slug "hanoi-south-apr26" and push everything to Vietnam Roadtrips.
Return the share link when done.
```

Your AI will use the MCP tools to build the full plan and return something like:

```
Here's your trip: https://trips.naai.studio/?session=a3f8c2e1d4b7
```

Open it. Share it. Done.

---

## What the app shows

Each stop on your itinerary gets its own card on a vertical timeline, connected by transport info (vehicle type, duration, estimated fare). Click any stop to expand:

- **Map** — all attractions pinned with geographic coordinates, routed in a logical order
- **Attractions** — name, recommended visit time, adult/child ticket prices
- **Food** — local dishes worth trying at that stop
- **Stay** — accommodation name and nightly budget
- **Cost overview** — running total across the whole trip (transport + attractions + food + stay)

---

## MCP tools reference

| Tool | What it does |
|------|-------------|
| `create_plan` | Create a new trip with a custom slug → returns `shareUrl` |
| `add_location` | Add a stop (province/city) with transport, accommodation, food, cost details |
| `update_location` | Edit any field on a stop |
| `delete_location` | Remove a stop |
| `add_sub_location` | Add an attraction inside a stop (e.g. Ha Long Bay inside Quang Ninh) |
| `update_sub_location` | Edit an attraction |
| `delete_sub_location` | Remove an attraction |
| `get_plan` | Read back the full plan (locations + attractions) |
| `list_plans` | List all plans on the server |
| `update_plan` | Rename or change the slug |
| `delete_plan` | Delete the plan |

---

## Self-hosting

If you want to run your own instance:

```bash
# 1. Clone and install
git clone https://github.com/leolionart/vietnam-travel.git
cd vietnam-travel
cd api && npm install

# 2. Configure
cp .env.example .env   # set DB_PATH, ADMIN_PASSWORD, JWT_SECRET

# 3. Run API server (port 7321)
npm run dev

# 4. Build and serve the frontend
cd ../public && npm install && npm run dev   # port 3000
```

Then point your MCP at `http://localhost:7321` instead of `https://trips.naai.studio`.

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | ✅ | JWT signing secret |
| `ADMIN_PASSWORD` | ✅ | Admin panel password |
| `DB_PATH` | | SQLite file path (default: `./travel.db`) |
| `PORT` | | API port (default: `7321`) |

### Docker

```bash
cp .env.example .env
mkdir -p data
docker compose up -d
```

---

*Built by [leolionart](https://github.com/leolionart)*
