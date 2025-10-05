#!/bin/bash

echo "Setting up Spotify Blend Generator as standalone service..."

# Create directory
sudo mkdir -p /opt/spotify-blend-standalone

# Copy files
sudo cp /tmp/server-standalone.js /opt/spotify-blend-standalone/server.js
sudo cp /tmp/index-fixed.html /opt/spotify-blend-standalone/index.html
sudo cp /tmp/*.js /opt/spotify-blend-standalone/ 2>/dev/null || true
sudo cp /tmp/package.json /opt/spotify-blend-standalone/ 2>/dev/null || true

# Copy tokens if they exist
sudo cp /opt/spotify-blend-fixed/sources/.tokens.json /opt/spotify-blend-standalone/ 2>/dev/null || true

# Install dependencies
cd /opt/spotify-blend-standalone
sudo npm install

# Set permissions
sudo chown -R nobody:nogroup /opt/spotify-blend-standalone
sudo chmod +x /opt/spotify-blend-standalone/server.js

# Install systemd service
sudo cp /tmp/spotify-blend-standalone.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable spotify-blend-standalone
sudo systemctl start spotify-blend-standalone

# Add nginx configuration
sudo cp /tmp/nginx-standalone.conf /etc/nginx/sites-available/spotify-blend-standalone
sudo ln -sf /etc/nginx/sites-available/spotify-blend-standalone /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

echo "Standalone deployment complete!"
echo "Access at: https://hapfel.org/spotify-blend/"
echo "Service status:"
sudo systemctl status spotify-blend-standalone --no-pager