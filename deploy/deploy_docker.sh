#!/bin/bash

# Default Configuration
APP_NAME="vocab-pro"
HOST_PORT=8080
NODE_VERSION="20-alpine"

# Load Config File
CONFIG_FILE="deploy/docker_config.txt"
if [ -f "$CONFIG_FILE" ]; then
    echo "📜 Loading configuration from $CONFIG_FILE..."
    # Source the config file to load variables
    source "$CONFIG_FILE"
else
    echo "⚠️  $CONFIG_FILE not found. Using default settings."
fi

echo "🐳 Starting Deployment for: $APP_NAME"
echo "   - Host Port: $HOST_PORT"
echo "   - Node Ver:  $NODE_VERSION"

# Generate Dockerfile
DOCKER_FILE="deploy/Dockerfile"
echo "🔨 Generating $DOCKER_FILE..."

cat <<EOF > "$DOCKER_FILE"
# --- Stage 1: Build ---
FROM node:${NODE_VERSION} as build
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
EOF

echo "✅ Dockerfile generated."

# Build Docker Image
echo "🏗️  Building Docker Image..."
# Use the generated Dockerfile
if ! docker build -t "$APP_NAME" -f "$DOCKER_FILE" .; then
    echo "❌ Docker build failed."
    exit 1
fi

# Cleanup Old Container
if [ "$(docker ps -q -f name="$APP_NAME")" ]; then
    echo "🛑 Stopping running container..."
    docker stop "$APP_NAME"
fi

if [ "$(docker ps -aq -f status=exited -f name="$APP_NAME")" ]; then
    echo "🧹 Removing old container..."
    docker rm "$APP_NAME"
fi

# Run New Container
echo "🚀 Starting Container on port $HOST_PORT..."

if [ -n "$API_KEY" ]; then
    echo "🔑 API_KEY detected in current environment. Injecting..."
    docker run -d \
        -p "$HOST_PORT":80 \
        -e API_KEY="$API_KEY" \
        --name "$APP_NAME" \
        --restart unless-stopped \
        "$APP_NAME"
else
    echo "⚠️  No API_KEY environment variable set."
    echo "   Running in Manual Mode (User must provide API keys in UI)."
    docker run -d \
        -p "$HOST_PORT":80 \
        --name "$APP_NAME" \
        --restart unless-stopped \
        "$APP_NAME"
fi

echo "---------------------------------------------------"
echo "✅ Deployment Successful!"
echo "👉 App is running at: http://localhost:$HOST_PORT"
echo "---------------------------------------------------"
