FROM node:20-alpine AS base
WORKDIR /app

# ── deps: production dependencies only ──────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/auth-service/package.json ./apps/auth-service/package.json
RUN npm ci --workspace=apps/auth-service --omit=dev --ignore-scripts

# ── builder: compile TypeScript ──────────────────────────────────────────────
FROM base AS builder
COPY package.json package-lock.json ./
COPY apps/auth-service/package.json ./apps/auth-service/package.json
RUN npm ci --workspace=apps/auth-service --ignore-scripts
COPY apps/auth-service/src      ./apps/auth-service/src
COPY apps/auth-service/tsconfig.json ./apps/auth-service/tsconfig.json
RUN npm run build -w apps/auth-service

# ── runner ───────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
# Root node_modules (hoisted workspace packages)
COPY --from=deps /app/node_modules ./node_modules
# Compiled output
COPY --from=builder /app/apps/auth-service/dist ./apps/auth-service/dist
COPY apps/auth-service/package.json ./apps/auth-service/package.json
WORKDIR /app/apps/auth-service
EXPOSE 3002
CMD ["node", "dist/index.js"]
