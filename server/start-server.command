#!/bin/bash
# Get the directory where this script is located to ensure paths are correct
BASEDIR=$(dirname "$0")

# Navigate to the script's directory, which is the server directory
cd "$BASEDIR"

# Check if the server is already running
if [ -f server.pid ]; then
    PID=$(cat server.pid)
    # Check if a process with that PID is actually running
    if ps -p $PID > /dev/null; then
        echo "Server is already running with PID: $PID"
        sleep 3
        exit 1
    fi
fi

# Start the node server in the background using nohup
# This prevents the server from stopping when the terminal window is closed
# stdout and stderr are redirected to a log file
nohup node index.js > server.log 2>&1 &

# Save the Process ID (PID) of the background server to a file
# The '$!' variable holds the PID of the last command run in the background
echo $! > server.pid

echo "Server started successfully in the background."
echo "Output is being written to server/server.log"

# Keep the terminal window open for a few seconds to show the message
sleep 3
