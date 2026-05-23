FROM node:20-alpine AS base
WORKDIR /app

# ── deps: production dependencies only ──────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/task-service/package.json ./apps/task-service/package.json
RUN npm ci --workspace=apps/task-service --omit=dev --ignore-scripts

# ── builder: compile TypeScript ──────────────────────────────────────────────
FROM base AS builder
COPY package.json package-lock.json ./
COPY apps/task-service/package.json ./apps/task-service/package.json
RUN npm ci --workspace=apps/task-service --ignore-scripts
COPY apps/task-service/src      ./apps/task-service/src
COPY apps/task-service/tsconfig.json ./apps/task-service/tsconfig.json
RUN npm run build -w apps/task-service

# ── runner ───────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/task-service/dist ./apps/task-service/dist
COPY apps/task-service/package.json ./apps/task-service/package.json
WORKDIR /app/apps/task-service
EXPOSE 3003
CMD ["node", "dist/index.js"]
