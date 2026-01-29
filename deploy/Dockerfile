# --- Stage 1: Build ---
FROM node:20-alpine as build
WORKDIR /app

# Install dependencies
COPY package*.json ./
# Using npm install to ensure compatibility if lockfile is missing or out of sync
RUN npm install

# Copy source code
COPY . .

# Build the application
# We set a placeholder API key here because Vite embeds env vars at build time.
# The actual key is injected into the HTML at runtime by entrypoint.sh.
ENV API_KEY=PLACEHOLDER_API_KEY
RUN npm run build

# --- Stage 2: Serve ---
FROM nginx:alpine

# Copy built assets from builder
COPY --from=build /app/dist /usr/share/nginx/html

# Copy Nginx configuration
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# Copy Entrypoint script for runtime environment injection
COPY deploy/entrypoint.sh /docker-entrypoint.d/40-inject-env.sh
RUN chmod +x /docker-entrypoint.d/40-inject-env.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
