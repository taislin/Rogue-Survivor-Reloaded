# Rogue Survivor Reloaded — browser port, production image.
#
# Build from the REPOSITORY ROOT (not web/):
#     docker build -t rogue-survivor-web .
#     docker run -p 8080:8080 rogue-survivor-web
#
# Context is the repo root because the C# original in src/ is the port's
# reference and must never be modified -- so the Docker build has no business
# touching it. .dockerignore keeps it (and everything else irrelevant) out of
# the context, which is what stops this from being an ~116 MB upload.

# ── Stage 1: build the bundle and compile the server ──────────────────────────
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Copy manifests first so `npm ci` is cached independently of source edits.
COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./

# `npm run build` is `tsc -p tsconfig.json && vite build`. The tsc pass is not
# redundant: it type-checks tests/ as well as src/ (both are in the include
# list), so a type error fails the image build rather than shipping.
RUN npm run build && npm run build:server

# Drop dev dependencies from the tree we are about to copy, so the runtime
# stage can install production-only without a second network round trip.
RUN npm prune --omit=dev

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server/server ./dist-server/server
COPY --from=build /app/package.json ./package.json

# Run unprivileged. The node image ships a `node` user (uid 1000) precisely for
# this; the dist tree is read-only at runtime, so no chown is needed.
USER node

EXPOSE 8080

# Uses node's global fetch (Node 18+), so no curl in the image just for this.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist-server/server/index.js"]
