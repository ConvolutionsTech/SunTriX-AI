# ------------------------------------
# Stage 1: Builder
# ------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install exactly what the lockfile pins (dev deps are needed for tsc)
COPY package.json package-lock.json ./
RUN npm ci

# Copy only what the build needs (tests are excluded by .dockerignore and tsconfig.build.json)
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ------------------------------------
# Stage 2: Production
# ------------------------------------
FROM node:22-alpine

ARG GIT_SHA=unknown
LABEL org.opencontainers.image.revision=$GIT_SHA
# Exposed to the app (Sentry release, logs)
ENV GIT_SHA=$GIT_SHA

ENV NODE_ENV=production

# Create the app dir as root and hand it to the non-root 'node' user,
# so this works on both BuildKit and the legacy builder
WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=node:node /app/dist ./dist

EXPOSE 4000

# Start period covers the worst-case MongoDB connect retry in config/db.ts (~70s).
# /ready fails while MongoDB is unreachable or the process is draining after SIGTERM.
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/ready', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Run node directly (not npm start) for lower overhead and correct SIGTERM handling
CMD ["node", "dist/app.js"]
