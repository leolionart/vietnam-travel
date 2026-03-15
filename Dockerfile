# ── Stage 1: Build admin React app ──────────────────────
FROM node:20-alpine AS build-admin
WORKDIR /build/admin
COPY admin/package*.json ./
RUN npm ci
COPY admin/ ./
RUN npm run build

# ── Stage 2: Build API TypeScript ────────────────────────
FROM node:20-alpine AS build-api
WORKDIR /build/api
COPY api/package*.json ./
RUN npm ci
COPY api/ ./
RUN npm run build

# ── Final image ───────────────────────────────────────────
FROM node:20-alpine
RUN apk add --no-cache wget

WORKDIR /app

# API runtime dependencies
COPY api/package*.json ./
RUN npm ci --omit=dev

# API compiled code
COPY --from=build-api /build/api/dist ./dist

# SQL schema (not compiled by tsc, must be copied separately)
COPY api/src/db/schema.sql ./dist/db/schema.sql

# Static files: public SPA + admin dashboard
COPY public/index.html  ./static/public/index.html
COPY public/plans.json  ./static/public/plans.json
COPY public/favicon.svg ./static/public/favicon.svg
COPY public/plans.json  ./plans.json
COPY --from=build-admin /build/dist/admin ./static/admin

ENV PORT=7321
ENV NODE_ENV=production

EXPOSE 7321

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://localhost:7321/api/health || exit 1

CMD ["node", "dist/index.js"]
