# AGENTS.md

Follow `docs/agents.md` for the full project map and maintenance guide.

## Project Scope

This workspace is the Vietnam Travel Planner project. Public UI changes go in
`public/index.html`; admin changes go in `admin/src/`; backend and data-loading
changes go in `api/src/`.

Do not edit the deprecated root `index.html`, root `vite.config.ts`, or
`dev-server.ts` for production behavior.

## Deployment Persistence

Production runs from the Docker image built from this repository and deployed
with Docker Compose on the travel VPS. For changes that must survive a prod
redeploy, update the repository source of truth first:

- Plan/location seed data: update `plans.json`.
- Sub-location seed data: update `SUB_LOCATION_SEEDS` in
  `api/src/db/migrate.ts`.
- Existing production DB data: apply the equivalent SQLite change on the VPS
  or reset/reseed intentionally via `scripts/redeploy.sh`.

Do not rely on one-off local SQLite edits or manual prod DB edits as the only
copy of a plan change. They will drift or disappear on a future reset.

Use `scripts/redeploy.sh --keep-db` for code-only deploys. Use
`scripts/redeploy.sh` only when intentionally resetting and reseeding from the
repository state.

Never write server passwords or admin secrets into repo files, memory, logs, or
documentation.
