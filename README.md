# Vietnam Roadtrips — Visual travel planner powered by AI

> Chat with your AI. Get a shareable link. No login. No friction.

**[trips.naai.studio](https://trips.naai.studio)**

---

## The idea

Western travel culture loves roadtrips — hopping between towns, experiencing local food, sleeping somewhere new every night. Vietnam is *perfect* for this: the country stretches 1,650 km from north to south, packed with distinct provinces, each with its own cuisine, landscapes, and rhythm.

Most AIs can plan a great multi-stop Vietnam itinerary — but the output is a wall of text. **Vietnam Roadtrips** gives that plan a visual home: an interactive timeline with a live map, estimated time at each attraction, transport between stops, food recommendations, and cost estimates. All rendered beautifully from a single shareable link.

![Visually](https://7b50d2de0634f64.cmccloud.com.vn/pasterly/Image%20(1628x1335))

---

## Quick start — Add the MCP to your AI

No installation needed. Connect your AI directly to the server:

```
https://trips.naai.studio/mcp
```

Pick your AI client below:

<details>
<summary><strong>Claude Desktop</strong></summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vietnam-roadtrips": {
      "url": "https://trips.naai.studio/mcp"
    }
  }
}
```

Restart Claude Desktop.

</details>

<details>
<summary><strong>Claude Code</strong></summary>

Run in terminal:

```bash
claude mcp add vietnam-roadtrips --transport http https://trips.naai.studio/mcp
```

Or add manually to `~/.claude/claude_desktop_config.json` (same JSON as Claude Desktop above).

</details>

<details>
<summary><strong>Cursor</strong></summary>

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "vietnam-roadtrips": {
      "url": "https://trips.naai.studio/mcp"
    }
  }
}
```

</details>

<details>
<summary><strong>Windsurf</strong></summary>

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "vietnam-roadtrips": {
      "url": "https://trips.naai.studio/mcp"
    }
  }
}
```

</details>

<details>
<summary><strong>Gemini CLI</strong></summary>

Edit `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "vietnam-roadtrips": {
      "url": "https://trips.naai.studio/mcp"
    }
  }
}
```

</details>

<details>
<summary><strong>Antigravity</strong></summary>

Add in the MCP settings panel:

```json
{
  "mcpServers": {
    "vietnam-roadtrips": {
      "url": "https://trips.naai.studio/mcp"
    }
  }
}
```

</details>

<details>
<summary><strong>OpenAI Codex CLI</strong></summary>

Edit `~/.codex/config.toml`:

```toml
[mcp_servers.vietnam-roadtrips]
url = "https://trips.naai.studio/mcp"
```

</details>

<details>
<summary><strong>Zed</strong></summary>

Open **Settings → context_servers** and add:

```json
{
  "context_servers": {
    "vietnam-roadtrips": {
      "source": "custom",
      "command": {
        "path": "npx",
        "args": ["-y", "@modelcontextprotocol/inspector", "https://trips.naai.studio/mcp"]
      }
    }
  }
}
```

> Zed doesn't natively support HTTP MCP yet. The workaround above uses the MCP inspector as a bridge. Check [Zed's MCP docs](https://zed.dev/docs/mcp) for updates.

</details>

<details>
<summary><strong>Continue.dev</strong></summary>

Create `.continue/mcpServers/vietnam-roadtrips.yaml`:

```yaml
name: vietnam-roadtrips
url: https://trips.naai.studio/mcp
```

</details>

---

## Try it

Once connected, paste this into your AI:

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

Your AI will return something like:

```
Here's your trip: https://trips.naai.studio/?session=a3f8c2e1d4b7
```

Open it. Share it. Done.

---

## What the app shows

Each stop on your itinerary gets its own card on a vertical timeline, connected by transport info. Click any stop to expand:

- **Map** — all attractions pinned with geographic coordinates
- **Attractions** — name, recommended visit time, adult/child ticket prices
- **Food** — local dishes worth trying at that stop
- **Stay** — accommodation name and nightly budget
- **Cost overview** — running total across the whole trip (transport + attractions + food + stay)

---

## MCP tools reference

| Tool | What it does |
|------|-------------|
| `create_plan` | Create a new trip → returns `shareUrl` |
| `add_location` | Add a stop (province/city) with transport, accommodation, food, cost details |
| `update_location` | Edit any field on a stop |
| `delete_location` | Remove a stop |
| `add_sub_location` | Add an attraction inside a stop (e.g. Ha Long Bay inside Quang Ninh) |
| `update_sub_location` | Edit an attraction |
| `delete_sub_location` | Remove an attraction |
| `get_plan` | Read back the full plan (locations + attractions) |
| `update_plan` | Rename or change the slug |
| `delete_plan` | Delete the plan |

Plans created via MCP are session-isolated — they don't appear in the main site listing and are only accessible via your unique share link.

---

## Self-hosting

<details>
<summary>Run your own instance</summary>

```bash
# 1. Clone and install
git clone https://github.com/leolionart/vietnam-travel.git
cd vietnam-travel
cd api && npm install

# 2. Configure
cp .env.example .env   # set DB_PATH, ADMIN_PASSWORD, JWT_SECRET, APP_URL

# 3. Run API server (port 7321) — MCP available at http://localhost:7321/mcp
npm run dev

# 4. Build and serve the frontend
cd ../public && npm install && npm run dev   # port 3000
```

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | ✅ | JWT signing secret |
| `ADMIN_PASSWORD` | ✅ | Admin panel password |
| `APP_URL` | | Public URL (default: `https://trips.naai.studio`) |
| `DB_PATH` | | SQLite file path (default: `./travel.db`) |
| `PORT` | | API port (default: `7321`) |

### Docker

```bash
cp .env.example .env
mkdir -p data
docker compose up -d
```

### Local stdio MCP (for self-hosters)

If you prefer the classic stdio approach, point the MCP at your local server:

```json
{
  "mcpServers": {
    "vietnam-roadtrips": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/vietnam-travel/api/src/mcp.ts"],
      "env": {
        "REMOTE_API_URL": "http://localhost:7321"
      }
    }
  }
}
```

</details>

---

*Built by [leolionart](https://github.com/leolionart)*
