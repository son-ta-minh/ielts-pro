# Stage 1: Build the React application
FROM node:18-alpine AS build
WORKDIR /usr/src/app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Serve the application with Nginx
FROM nginx:alpine

# Copy the build output from the 'build' stage
COPY --from=build /usr/src/app/dist /usr/share/nginx/html

# Copy custom Nginx configuration for SPA and HTTPS
COPY server/nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 443 for HTTPS
EXPOSE 443

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
