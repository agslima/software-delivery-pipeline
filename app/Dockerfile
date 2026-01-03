# ==========================================
# STAGE 1: The Builder (Compilers & Secrets)
# ==========================================
FROM node:24.11.1-alpine3.21 AS builder

WORKDIR /build

# Install OS updates to patch vulnerabilities in the base image immediately
# In case the cache invalidates if security updates are needed
# hadolint ignore=DL3018
RUN apk update && apk upgrade --no-cache

# Dependencies (The Caching Layer)
COPY server/package*.json ./

# RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci
RUN npm ci

# Copy the rest of the source
COPY server/ ./server/
COPY public/ ./public/

# Prune to only production dependencies for the final copy
RUN npm prune --production

# ==========================================
# STAGE 2: The Runtime (Clean & Secure)
# ==========================================
FROM node:24.11.1-alpine3.21

# 1. SECURITY FIX: Install Tini (The Init Process)
# Tini ensures signals are forwarded and zombies are reaped.
RUN apk add --no-cache tini

# 2. Environment Setup
ENV NODE_ENV=production
WORKDIR /app

# 3. Copy artifacts from the Builder stage
COPY --from=builder --chown=node:node /build/node_modules ./node_modules
COPY --from=builder --chown=node:node /build/server ./server
COPY --from=builder --chown=node:node /build/public ./public

# 4. Hardening
# Remove npm (prevents 'npm install' attacks if RCE occurs)
# Remove APK (prevents installing new binary tools)
# Remove Shell (Optional/Advanced: prevents many shell-based exploits)
RUN npm uninstall -g npm && \
    rm -rf /usr/local/lib/node_modules/npm

# 5. Switch to Non-Root
USER node

# 6. Correct Entrypoint
EXPOSE 8080
WORKDIR /app/server

# Tini acts as PID 1, spawns Node as a child, and handles signals correctly.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]
