FROM node:20-alpine AS base
WORKDIR /app

# ── deps: production dependencies only ──────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --workspace=apps/web --omit=dev --ignore-scripts

# ── builder: Next.js build ───────────────────────────────────────────────────
FROM base AS builder
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --workspace=apps/web --ignore-scripts
COPY apps/web ./apps/web
# NEXT_PUBLIC_ vars are inlined at build time; override at build-arg for prod
ARG NEXT_PUBLIC_GATEWAY_URL=http://localhost:3001
ENV NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL
RUN npm run build -w apps/web

# ── runner: Next.js standalone ───────────────────────────────────────────────
FROM node:20-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
# Standalone output bundles everything needed to run
COPY --from=builder /app/apps/web/.next/standalone ./
# Static assets and public dir must be added alongside standalone
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
