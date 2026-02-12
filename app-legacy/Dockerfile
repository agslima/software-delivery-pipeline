# ==========================================
# STAGE 1: The Builder (Compilers & Secrets)
# ==========================================
FROM node:24.11.1-alpine3.21 AS builder

WORKDIR /build

RUN apk update && apk upgrade --no-cache

# Dependencies (The Caching Layer)
COPY server/package*.json ./

# RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci
RUN npm ci

COPY server/ ./server/
COPY public/ ./public/

# Prune to only production dependencies for the final copy
RUN npm prune --production

# ==========================================
# STAGE 2: The Runtime
# ==========================================
FROM node:24.11.1-alpine3.21

# hadolint ignore=DL3018
RUN apk add --no-cache tini

# 2. Environment Setup
ENV NODE_ENV=production
WORKDIR /app

# 3. Copy artifacts from the Builder stage
COPY --from=builder --chown=node:node /build/node_modules ./node_modules
COPY --from=builder --chown=node:node /build/server ./server
COPY --from=builder --chown=node:node /build/public ./public

RUN npm uninstall -g npm && \
    rm -rf /usr/local/lib/node_modules/npm

USER node

EXPOSE 8080
WORKDIR /app/server

# Tini acts as PID 1, spawns Node as a child, and handles signals correctly.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]
