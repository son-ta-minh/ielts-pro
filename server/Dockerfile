# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy server-specific package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm install

# Bundle app source
COPY . .

# The app binds to a port, which we will expose
# The default port in your index.js is likely 3000, but we'll use 8080 internally for flexibility
EXPOSE 8080

# Define the command to run your app
CMD [ "node", "index.js" ]
