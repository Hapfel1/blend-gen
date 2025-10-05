#!/bin/bash

# Complete deployment script for Spotify Blend Generator
# This script copies all necessary files to the server

echo "Starting complete deployment of Spotify Blend Generator..."

# Define source and destination
LOCAL_DIR="c:/Users/quird/code/my-blend"
REMOTE_USER="hapfel"
REMOTE_HOST="192.168.2.139"
REMOTE_DIR="/opt/spotify-blend-standalone"

# Core application files
echo "Copying core application files..."
scp server-standalone.js $REMOTE_USER@$REMOTE_HOST:/tmp/
scp package.json $REMOTE_USER@$REMOTE_HOST:/tmp/
scp package-lock.json $REMOTE_USER@$REMOTE_HOST:/tmp/

# Main blend generation files
echo "Copying blend generation files..."
scp quick-blend.js $REMOTE_USER@$REMOTE_HOST:/tmp/
scp blend-algorithm.js $REMOTE_USER@$REMOTE_HOST:/tmp/
scp auth.mjs $REMOTE_USER@$REMOTE_HOST:/tmp/
scp spotify-api.js $REMOTE_USER@$REMOTE_HOST:/tmp/
scp track-utils.js $REMOTE_USER@$REMOTE_HOST:/tmp/
scp playlist-manager.js $REMOTE_USER@$REMOTE_HOST:/tmp/

# Configuration and data files
echo "Copying configuration files..."
scp blend-config.json $REMOTE_USER@$REMOTE_HOST:/tmp/
scp always-include.json $REMOTE_USER@$REMOTE_HOST:/tmp/
scp block-artists.json $REMOTE_USER@$REMOTE_HOST:/tmp/
scp block-tracks.json $REMOTE_USER@$REMOTE_HOST:/tmp/

# History and state files
echo "Copying history and state files..."
scp .blend-history.json $REMOTE_USER@$REMOTE_HOST:/tmp/ 2>/dev/null || echo "No blend history found, will be created"
scp .blend-playlist.json $REMOTE_USER@$REMOTE_HOST:/tmp/ 2>/dev/null || echo "No playlist history found, will be created"
scp .tokens.json $REMOTE_USER@$REMOTE_HOST:/tmp/ 2>/dev/null || echo "No tokens file found, will be created"

# Web interface
echo "Copying web interface..."
scp index-fixed.html $REMOTE_USER@$REMOTE_HOST:/tmp/

# Service configuration
echo "Copying service configuration..."
scp spotify-blend-standalone.service $REMOTE_USER@$REMOTE_HOST:/tmp/

# Environment file (if exists)
scp .env $REMOTE_USER@$REMOTE_HOST:/tmp/ 2>/dev/null || echo "No .env file found, will use systemd environment"

echo "All files copied to /tmp/ on remote server."
echo "Now connecting to server to move files and restart service..."

# SSH into server and set up files
ssh $REMOTE_USER@$REMOTE_HOST << 'EOF'
echo "Moving files to /opt/spotify-blend-standalone/..."
sudo mkdir -p /opt/spotify-blend-standalone
sudo chown hapfel:hapfel /opt/spotify-blend-standalone

# Move all files from /tmp to the correct location
sudo mv /tmp/server-standalone.js /opt/spotify-blend-standalone/
sudo mv /tmp/package.json /opt/spotify-blend-standalone/
sudo mv /tmp/package-lock.json /opt/spotify-blend-standalone/
sudo mv /tmp/quick-blend.js /opt/spotify-blend-standalone/
sudo mv /tmp/blend-algorithm.js /opt/spotify-blend-standalone/
sudo mv /tmp/auth.mjs /opt/spotify-blend-standalone/
sudo mv /tmp/spotify-api.js /opt/spotify-blend-standalone/
sudo mv /tmp/track-utils.js /opt/spotify-blend-standalone/
sudo mv /tmp/playlist-manager.js /opt/spotify-blend-standalone/
sudo mv /tmp/blend-config.json /opt/spotify-blend-standalone/
sudo mv /tmp/always-include.json /opt/spotify-blend-standalone/
sudo mv /tmp/block-artists.json /opt/spotify-blend-standalone/
sudo mv /tmp/block-tracks.json /opt/spotify-blend-standalone/
sudo mv /tmp/index-fixed.html /opt/spotify-blend-standalone/

# Move history files if they exist
sudo mv /tmp/.blend-history.json /opt/spotify-blend-standalone/ 2>/dev/null || echo "No blend history to move"
sudo mv /tmp/.blend-playlist.json /opt/spotify-blend-standalone/ 2>/dev/null || echo "No playlist history to move"
sudo mv /tmp/.tokens.json /opt/spotify-blend-standalone/ 2>/dev/null || echo "No tokens file to move"
sudo mv /tmp/.env /opt/spotify-blend-standalone/ 2>/dev/null || echo "No .env file to move"

# Set proper ownership
sudo chown -R hapfel:hapfel /opt/spotify-blend-standalone/

# Install/update service file
sudo mv /tmp/spotify-blend-standalone.service /etc/systemd/system/
sudo systemctl daemon-reload

# Install dependencies
cd /opt/spotify-blend-standalone
npm install

echo "Restarting service..."
sudo systemctl restart spotify-blend-standalone
sudo systemctl status spotify-blend-standalone

echo "Deployment complete! Service should be running on https://hapfel.org:3000/"
EOF

echo "Deployment script finished!"