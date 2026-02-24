#!/bin/bash
# Get the directory where this script is located
BASEDIR=$(dirname "$0")

# Navigate to the script's directory, which is the server directory
cd "$BASEDIR"

# Check if the PID file exists
if [ ! -f server.pid ]; then
    echo "Server does not appear to be running (no PID file found)."
    sleep 3
    exit 1
fi

# Read the PID from the file
PID=$(cat server.pid)

# Check if a process with that PID is actually running
if ! ps -p $PID > /dev/null; then
    echo "Server is not running (process with PID $PID not found)."
    # Clean up the stale PID file
    rm server.pid
    sleep 3
    exit 1
fi

# Stop the server process
kill $PID

# Check if the process was stopped successfully
if [ $? -eq 0 ]; then
    echo "Server with PID $PID has been stopped successfully."
    # Remove the PID file
    rm server.pid
else
    echo "Failed to stop server with PID $PID. It may need to be stopped manually."
fi

# Wait for the user to press a key before closing the window
read -p "Press any key to close this window..."
