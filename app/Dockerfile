# 1. Base Image
# Use the slim version.
# 'slim' images have fewer vulnerabilities than full OS images.
FROM node:24.11.1-alpine3.21

# 2. Environment Setup
# setting NODE_ENV to production ensures many libraries (like Express)
# switch to fast/secure modes automatically.
ENV NODE_ENV=production
WORKDIR /app

# 3. Dependencies (The Caching Layer)
WORKDIR /app/server
COPY server/package*.json ./

# 'npm ci' is strictly for CI/CD (uses lockfile).
# '--only=production' prevents installing devDependencies (like Jest/Eslint) in the final image.
# 'npm cache clean' reduces the final image size.
RUN npm ci --only=production && \
    npm cache clean --force && \
    npm uninstall -g npm && \
    rm -rf /usr/local/lib/node_modules/npm

# 4. Copy Codebase (Preserving Structure)
# Go back to the root /app to copy folders correctly
WORKDIR /app

# COPY public folder to /app/public
COPY --chown=node:node public/ ./public/

# COPY server folder to /app/server
COPY --chown=node:node server/ ./server/

# 5. Execution Setup
# Switch back to server directory so "node index.js" works
WORKDIR /app/server
USER node
EXPOSE 8080

# Run the app
CMD [ "node", "index.js" ]
