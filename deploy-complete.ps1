# Complete deployment script for Spotify Blend Generator (PowerShell)
# This script copies all necessary files to the server

Write-Host "Starting complete deployment of Spotify Blend Generator..." -ForegroundColor Green

# Define remote connection
$RemoteUser = "hapfel"
$RemoteHost = "192.168.2.139"
$RemoteDir = "/opt/spotify-blend-standalone"

# Core application files
Write-Host "Copying core application files..." -ForegroundColor Yellow
scp server-standalone.js "$RemoteUser@$RemoteHost:/tmp/"
scp package.json "$RemoteUser@$RemoteHost:/tmp/"
scp package-lock.json "$RemoteUser@$RemoteHost:/tmp/"

# Main blend generation files
Write-Host "Copying blend generation files..." -ForegroundColor Yellow
scp quick-blend.js "$RemoteUser@$RemoteHost:/tmp/"
scp blend-algorithm.js "$RemoteUser@$RemoteHost:/tmp/"
scp auth.mjs "$RemoteUser@$RemoteHost:/tmp/"
scp spotify-api.js "$RemoteUser@$RemoteHost:/tmp/"
scp track-utils.js "$RemoteUser@$RemoteHost:/tmp/"
scp playlist-manager.js "$RemoteUser@$RemoteHost:/tmp/"

# Configuration and data files
Write-Host "Copying configuration files..." -ForegroundColor Yellow
scp blend-config.json "$RemoteUser@$RemoteHost:/tmp/"
scp always-include.json "$RemoteUser@$RemoteHost:/tmp/"
scp block-artists.json "$RemoteUser@$RemoteHost:/tmp/"
scp block-tracks.json "$RemoteUser@$RemoteHost:/tmp/"

# History and state files
Write-Host "Copying history and state files..." -ForegroundColor Yellow
try { scp .blend-history.json "$RemoteUser@$RemoteHost:/tmp/" } catch { Write-Host "No blend history found, will be created" }
try { scp .blend-playlist.json "$RemoteUser@$RemoteHost:/tmp/" } catch { Write-Host "No playlist history found, will be created" }
try { scp .tokens.json "$RemoteUser@$RemoteHost:/tmp/" } catch { Write-Host "No tokens file found, will be created" }

# Web interface
Write-Host "Copying web interface..." -ForegroundColor Yellow
scp index-fixed.html "$RemoteUser@$RemoteHost:/tmp/"

# Service configuration
Write-Host "Copying service configuration..." -ForegroundColor Yellow
scp spotify-blend-standalone.service "$RemoteUser@$RemoteHost:/tmp/"

# Environment file (if exists)
try { scp .env "$RemoteUser@$RemoteHost:/tmp/" } catch { Write-Host "No .env file found, will use systemd environment" }

Write-Host "All files copied to /tmp/ on remote server." -ForegroundColor Green
Write-Host "Now connecting to server to move files and restart service..." -ForegroundColor Yellow

# Create the SSH command
$sshCommand = @"
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
"@

# Execute SSH command
ssh "$RemoteUser@$RemoteHost" $sshCommand

Write-Host "Deployment script finished!" -ForegroundColor Green