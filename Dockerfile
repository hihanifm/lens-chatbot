ARG NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim

# ── base: install all deps ────────────────────────────────────────────
FROM ${NODE_IMAGE} AS base
WORKDIR /app
COPY package*.json ./
ARG HTTP_PROXY HTTPS_PROXY NO_PROXY
ENV HTTP_PROXY=$HTTP_PROXY HTTPS_PROXY=$HTTPS_PROXY NO_PROXY=$NO_PROXY
RUN npm ci

# ── dev: run source via tsx (src/ mounted as volume by compose) ───────
FROM base AS dev
COPY . .
ENV NODE_OPTIONS=--experimental-sqlite
CMD ["npx", "tsx", "src/index.ts"]

# ── build: compile TypeScript ─────────────────────────────────────────
FROM base AS build
COPY . .
RUN npm run build

# ── prod: minimal runtime image ───────────────────────────────────────
FROM ${NODE_IMAGE} AS prod
WORKDIR /app
COPY package*.json ./
ARG HTTP_PROXY HTTPS_PROXY NO_PROXY
ENV HTTP_PROXY=$HTTP_PROXY HTTPS_PROXY=$HTTPS_PROXY NO_PROXY=$NO_PROXY
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/static ./static
ENV NODE_OPTIONS=--experimental-sqlite
CMD ["node", "dist/index.js"]
