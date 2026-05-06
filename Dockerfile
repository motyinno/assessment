# syntax=docker/dockerfile:1.7

# ---------- deps (full, used by builder) ----------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ---------- prisma-cli (CLI for migrate deploy + tsx for db seed at runtime) ----------
FROM node:20-alpine AS prisma-cli
RUN apk add --no-cache libc6-compat openssl
WORKDIR /opt/prisma-cli
# Match the prisma version in package.json. Pinned here intentionally — bump
# when upgrading prisma in package.json. tsx is included so `prisma db seed`
# (configured in package.json to run `tsx prisma/seed.ts`) works at runtime.
RUN --mount=type=cache,target=/root/.npm \
    npm init -y > /dev/null && \
    npm install --no-save --omit=dev prisma@6.19.3 tsx@4.21.0 && \
    rm -rf node_modules/@prisma/engines/*darwin* \
           node_modules/@prisma/engines/*windows* \
           node_modules/@prisma/engines/*debian* \
           node_modules/@prisma/engines/*rhel*

# ---------- builder ----------
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- runner ----------
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Make the prisma CLI sidecar's bins (prisma, tsx) resolvable on PATH so
# `npx prisma db seed` and `tsx prisma/seed.ts` work via `docker compose exec`.
ENV PATH=/opt/prisma-cli/node_modules/.bin:$PATH

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Next.js standalone server output + static assets + public dir
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma schema + migrations (replayed by `migrate deploy` at boot)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Reference data read at runtime (tech matrix, PDP topics, mappings, template)
COPY --from=builder --chown=nextjs:nodejs /app/data ./data

# Sidecar Prisma CLI (separate dir to avoid clashing with standalone's
# minimal node_modules at /app/node_modules)
COPY --from=prisma-cli --chown=nextjs:nodejs /opt/prisma-cli /opt/prisma-cli

COPY --chown=nextjs:nodejs docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER nextjs
EXPOSE 3000

# Container-level liveness/readiness check. Hits the app's /api/health route
# (which itself pings the DB) so Compose / orchestrators see "unhealthy" if
# the app is up but the DB is unreachable.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
