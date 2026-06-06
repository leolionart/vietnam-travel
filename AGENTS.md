# AGENTS.md

Follow `docs/agents.md` for the full project map and maintenance guide.

For requests to inspect, configure, or edit existing prod travel plans, use the
project skill `.codex/skills/vietnam-travel-plan-editor/SKILL.md`.

## Project Scope

This workspace is the Vietnam Travel Planner project. Public UI changes go in
`public/index.html`; admin changes go in `admin/src/`; backend and data-loading
changes go in `api/src/`.

Do not edit the deprecated root `index.html`, root `vite.config.ts`, or
`dev-server.ts` for production behavior.

## Environment Data Boundaries

Production runs from the Docker image built from this repository and deployed
with Docker Compose on the travel VPS. Deploying this repository updates code
and schema only; it must not reset, seed, or copy plan data across environments.

- Production plan data lives in the production SQLite DB.
- Local/dev plan data lives in the local SQLite DB.
- Update data through Admin/CLI/MCP against the intended environment.
- Do not encode trip data in migrations, deploy scripts, docs, or source files
  as a way to move it to prod.

Use `scripts/redeploy.sh` for deploys; it keeps the existing DB. If an
environment needs replacement data, perform an explicit backup/restore or
Admin/CLI/MCP import outside the deploy path.

Never write server passwords or admin secrets into repo files, memory, logs, or
documentation.

## Release notes on push

- Before pushing user-facing, deployable, or behavior-changing work, include a
  release notes/changelog update in the same commit range whenever practical.
- This repo uses the shared pre-push hook at
  `/Volumes/DATA/Coding Projects/.codex-tools/git-hooks`. If pushed commits do
  not include release notes, the hook auto-generates them, commits `Add release
  notes`, and pushes the updated branch.
- Accepted paths: `CHANGELOG.md`, `Changelog.md`, `changelog.md`,
  `RELEASE_NOTES.md`, `RELEASE-NOTES.md`, `docs/releases/*.md`,
  `docs/release-notes/*.md`.
