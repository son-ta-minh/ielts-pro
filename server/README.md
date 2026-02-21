# Vocab Pro - Unified Server

This Node.js server provides two critical services for the Vocab Pro application:
1.  **Backup Service**: Handles streaming uploads/downloads of large JSON backup files (unlimited size).
2.  **TTS Service**: Provides high-quality Text-to-Speech using the native macOS `say` command.

## Prerequisites

*   **Node.js** installed.
*   **macOS** (Required for TTS functionality. Backup works on any OS).

## Installation

1.  Navigate to this folder:
    ```bash
    cd server
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

## HTTPS Configuration (Recommended)

Modern browsers require HTTPS for many features (like audio playback from local servers on secure sites).

### Option A: Using mkcert (Recommended)
This creates a locally trusted certificate.

1.  Install `mkcert` (one time per machine):
    ```bash
    brew install mkcert
    mkcert -install
    ```
2.  Run the generation script:
    ```bash
    npm run gen-cert
    ```
    This will generate `localhost.pem` and `localhost-key.pem` in `.certs/`.

### Option B: Self-Signed Fallback
If `mkcert` is not installed, running `npm run gen-cert` will fallback to `openssl`. The browser will show a warning ("Your connection is not private") which you must manually bypass.

## Running the Server

Start the server:
```bash
npm start
```
By default, it runs on **port 3001**. You can override this:
```bash
node index.js -p 4000
```

## Client Configuration

In the Vocab Pro web application settings:

1.  **Backup Settings**: Set Server URL to `https://localhost:3001` (or `http` if no certs).
2.  **Audio Coach**: Set TTS Server URL to `https://localhost:3001`.

## IMPORTANT: Trusting HTTPS

If you are using self-signed certificates (Option B), or if the browser blocks the connection:

1.  Open `https://localhost:3001/voices` in a new browser tab.
2.  You will see a security warning.
3.  Click **Advanced** -> **Proceed to localhost (unsafe)**.
4.  Once you see a JSON response, the web app can now connect to the server.

## API Endpoints

### Backup
*   `POST /api/backup?userId={id}`: Stream upload JSON.
*   `GET /api/backup/{userId}`: Stream download JSON.

### TTS (macOS Only)
*   `GET /voices`: List available system voices.
*   `POST /select-voice`: Set active voice context.
*   `POST /speak`: Generate and stream audio. Body: `{ "text": "...", "voice": "Samantha" }`.
