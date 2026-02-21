# Server Deployment with Docker

This setup uses Docker and Docker Compose to run the application behind an Nginx reverse proxy that handles HTTPS.

## Prerequisites

- Docker
- Docker Compose

## Setup Instructions

### 1. Generate SSL Certificates

Before you can run the server with HTTPS, you need to generate a self-signed SSL certificate. Your project includes a script for this.

First, make the script executable:
```bash
chmod +x server/generate_cert.sh
```

Then, run the script from the root directory of the project:
```bash
./server/generate_cert.sh
```

This will create the necessary certificate files for Nginx.

### 2. Build and Run the Containers

Navigate to the `/server` directory and use Docker Compose to build the images and start the services:

```bash
cd server
docker-compose up --build
```

- The `--build` flag tells Docker Compose to build the images from your `Dockerfile` before starting the containers.
- You can run it in the background by adding the `-d` (detached) flag: `docker-compose up --build -d`.

## Accessing the Application

Once the containers are running, you can access your application at:

**https://localhost:3000**

Since the SSL certificate is self-signed, your browser will show a security warning. You will need to accept the risk to proceed.

## Stopping the Server

To stop the application, press `Ctrl+C` in the terminal where `docker-compose` is running. If you are running in detached mode, use the following command from the `/server` directory:

```bash
docker-compose down
```

This will stop and remove the containers and the network created by Docker Compose.
