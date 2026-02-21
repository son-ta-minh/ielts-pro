# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or yarn.lock) to leverage Docker cache
COPY package*.json ./

# Install app dependencies
RUN npm install

# Bundle app source
COPY . .

# The app binds to 8080, but the reverse proxy will expose it on 3000 (via 443)
EXPOSE 8080

# Define the command to run your app
CMD [ "node", "server.ts" ]
