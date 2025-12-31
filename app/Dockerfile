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
# Copy ONLY the package definition files first.
# If package.json hasn't changed, Docker uses the cached layer here,
# making your builds instant.
COPY server/package*.json ./

# 'npm ci' is strictly for CI/CD (uses lockfile).
# '--only=production' prevents installing devDependencies (like Jest/Eslint) in the final image.
# 'npm cache clean' reduces the final image size.
RUN npm ci --only=production && \
    npm cache clean --force && \
    npm uninstall -g npm && \
    rm -rf /usr/local/lib/node_modules/npm

# 4. Application Code
# --chown=node:node is CRITICAL. It ensures the files belong to the
# non-root user, allowing the app to read them without root permissions.
COPY --chown=node:node server/ .

# 5. Security: Non-Root User
# This prevents an attacker from having root access to the container
# if they manage to compromise the application.
USER node

# 6. Network
EXPOSE 8080

# 7. Execution
CMD [ "node", "index.js" ]
