#!/bin/bash

# Quick fix script for Spotify Blend Generator web interface
# This script updates the API paths to work with nginx configuration

echo "🔧 Fixing Spotify Blend Generator web interface..."

# Backup the original file
sudo cp /opt/spotify-blend-fixed/sources/public/index.html /opt/spotify-blend-fixed/sources/public/index.html.backup

# Apply the fixes
sudo sed -i 's|/api/setup-status|/blend/api/setup-status|g' /opt/spotify-blend-fixed/sources/public/index.html
sudo sed -i 's|/api/status|/blend/api/status|g' /opt/spotify-blend-fixed/sources/public/index.html
sudo sed -i 's|/api/blend|/blend/api/blend|g' /opt/spotify-blend-fixed/sources/public/index.html

echo "✅ Web interface paths updated!"

# Restart the service
echo "🔄 Restarting service..."
sudo systemctl restart spotify_blend

echo "🎉 Spotify Blend Generator is now fixed!"
echo "Visit: https://hapfel.org/blend/"