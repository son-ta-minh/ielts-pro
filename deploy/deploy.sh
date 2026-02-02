#!/bin/bash

echo "🚀 Starting Manual Deployment (Node.js)..."

# 1. Install Dependencies
if [ ! -d "node_modules" ]; then
    echo "📦 node_modules not found. Installing dependencies..."
    npm install
else
    echo "📦 Checking for new dependencies..."
    npm install
fi

# 2. Build
echo "🔨 Building project for production..."
npm run build

# 3. Serve
if [ -d "dist" ]; then
    echo "✅ Build successful."
    echo "🌍 Serving application on http://localhost:8080..."
    
    # Check if 'serve' is available via npx
    if command -v npx &> /dev/null; then
        npx serve -s dist -l 8080
    else
        echo "❌ Error: 'npx' is not available. Please install Node.js correctly."
        exit 1
    fi
else
    echo "❌ Error: Build failed. 'dist' folder not found."
    exit 1
fi
