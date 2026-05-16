ARG NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim

# ── base: install all deps ────────────────────────────────────────────
FROM ${NODE_IMAGE} AS base
WORKDIR /app
COPY package*.json ./
ARG HTTP_PROXY HTTPS_PROXY NO_PROXY
ENV HTTP_PROXY=$HTTP_PROXY HTTPS_PROXY=$HTTPS_PROXY NO_PROXY=$NO_PROXY
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    jq \
    ripgrep \
 && rm -rf /var/lib/apt/lists/*
RUN npm ci

# ── dev: run source via tsx (src/ mounted as volume by compose) ───────
FROM base AS dev
COPY . .
ENV NODE_OPTIONS=--experimental-sqlite
ENV SKILLS_DIR=/app/skills
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
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    jq \
    ripgrep \
 && rm -rf /var/lib/apt/lists/*
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/static ./static
COPY --from=build /app/fixtures ./fixtures
COPY --from=build /app/skills ./skills
ENV NODE_OPTIONS=--experimental-sqlite
ENV SKILLS_DIR=/app/skills
CMD ["node", "dist/index.js"]
