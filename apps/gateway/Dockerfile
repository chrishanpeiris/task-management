FROM node:20-alpine AS base
WORKDIR /app

# ── deps: production dependencies only ──────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/gateway/package.json ./apps/gateway/package.json
RUN npm ci --workspace=apps/gateway --omit=dev --ignore-scripts

# ── builder: compile TypeScript ──────────────────────────────────────────────
FROM base AS builder
COPY package.json package-lock.json ./
COPY apps/gateway/package.json ./apps/gateway/package.json
RUN npm ci --workspace=apps/gateway --ignore-scripts
COPY apps/gateway/src      ./apps/gateway/src
COPY apps/gateway/tsconfig.json ./apps/gateway/tsconfig.json
RUN npm run build -w apps/gateway

# ── runner ───────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/gateway/dist ./apps/gateway/dist
COPY apps/gateway/package.json ./apps/gateway/package.json
WORKDIR /app/apps/gateway
EXPOSE 3001
CMD ["node", "dist/index.js"]
