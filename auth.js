import 'dotenv/config';
import fs from 'fs';
import { SpotifyAPI } from '@statsfm/spotify.js';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'https://hapfel.org/callback';

// Scopes we need for the blend
const SCOPES = [
  'user-read-private',
  'user-read-email', 
  'user-top-read',
  'user-read-recently-played',
  'playlist-modify-private',
  'playlist-modify-public'
].join(' ');

export function getAuthURL() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state: Math.random().toString(36).substring(7)
  });
  
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function getTokenFromCode(code) {
  // Securely store tokens in .tokens.json
  function saveTokens(user, tokens) {
    let allTokens = {};
    if (fs.existsSync('.tokens.json')) {
      allTokens = JSON.parse(fs.readFileSync('.tokens.json', 'utf8'));
    }
    allTokens[user] = tokens;
    fs.writeFileSync('.tokens.json', JSON.stringify(allTokens, null, 2));
  }
  const api = new SpotifyAPI({
    clientCredentials: {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    }
  });

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI
      })
    });

  const data = await response.json();
  console.log('Full token response:', data);
    
    if (data.error) {
      throw new Error(data.error_description);
    }
    
    // Save tokens securely for later refresh
    saveTokens('user', {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scope: data.scope
    });
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in
    };
// Function to refresh access token using stored refresh token
async function refreshAccessToken(user = 'user') {
  if (!fs.existsSync('.tokens.json')) throw new Error('No token file found');
  const allTokens = JSON.parse(fs.readFileSync('.tokens.json', 'utf8'));
  const tokens = allTokens[user];
  if (!tokens || !tokens.refreshToken) throw new Error('No refresh token found for user');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error_description);
  // Update stored access token
  tokens.accessToken = data.access_token;
  tokens.expiresIn = data.expires_in;
  allTokens[user] = tokens;
  fs.writeFileSync('.tokens.json', JSON.stringify(allTokens, null, 2));
  return tokens.accessToken;
}
  } catch (error) {
    console.error('Error getting token:', error);
    throw error;
  }
}

// Helper to get user info for verification
export async function getUserInfo(accessToken) {
  const api = new SpotifyAPI({
    clientCredentials: {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    },
    accessToken: accessToken
  });

  try {
    const user = await api.me.get();
    return user;
  } catch (error) {
    console.error('Error getting user info:', error);
    if (error.response) {
      console.error('Spotify error response:', error.response.data);
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
    }
    throw error;
  }
}