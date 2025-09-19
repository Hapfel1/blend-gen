// Extract unique genres from artist array
function extractGenres(artists) {
  const genres = new Set();
  artists.forEach(artist => {
    if (artist.genres) {
      artist.genres.forEach(genre => genres.add(genre));
    }
  });
  return Array.from(genres);
}
// Shuffle tracks, spreading artists
function shuffleTracks(tracks) {
  const shuffled = [...tracks];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  // Spread same artist tracks apart
  for (let i = 1; i < shuffled.length - 1; i++) {
    if (shuffled[i].artists[0].id === shuffled[i-1].artists[0].id) {
      for (let j = i + 1; j < shuffled.length; j++) {
        if (shuffled[j].artists[0].id !== shuffled[i-1].artists[0].id) {
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          break;
        }
      }
    }
  }
  return shuffled;
}
// Remove duplicate tracks by id
function removeDuplicates(tracks) {
  const seen = new Set();
  return tracks.filter(track => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}
import axios from 'axios';
import 'dotenv/config';
// Move createPlaylist above generateBlend to ensure it is defined before use
async function createPlaylist(token, tracks, user1, user2) {
  const fs = await import('fs/promises');
  const path = 'c:/Users/quird/code/my-blend/.blend-playlist.json';
  const playlistName = `${user1.display_name} + ${user2.display_name}`;
  const description = `Generated blend for ${user1.display_name} + ${user2.display_name}`;
  const userId = user1.id;
  const trackUris = tracks.map(track => track.uri);
  let playlistId = null;
  try {
    // Try to read playlistId from file
    try {
      const file = await fs.readFile(path, 'utf8');
      const data = JSON.parse(file);
      if (data.playlistId) playlistId = data.playlistId;
    } catch (err) {
      // File missing or invalid, ignore
    }
    let playlist = null;
    if (playlistId) {
      // Try to fetch playlist by ID
      try {
        const playlistRes = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        playlist = playlistRes.data;
      } catch (err) {
        // Playlist not found or deleted, fallback to create
        playlistId = null;
      }
    }
    if (!playlistId) {
      // Create playlist
      const playlistRes = await axios.post(
        `https://api.spotify.com/v1/users/${userId}/playlists`,
        {
          name: playlistName,
          description: description,
          public: false
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      playlist = playlistRes.data;
      playlistId = playlist.id;
      // Save playlistId to file
      await fs.writeFile(path, JSON.stringify({ playlistId }), 'utf8');
    } else {
      // Clear existing tracks before updating
      await axios.put(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
        { uris: [] },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
    }
    // Add tracks in batches (Spotify allows max 100 per request)
    const batchSize = 100;
    for (let i = 0; i < trackUris.length; i += batchSize) {
      const batch = trackUris.slice(i, i + batchSize);
      await axios.post(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
        { uris: batch },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
    }
    return playlist.external_urls.spotify;
  } catch (error) {
    console.error('Error creating/updating playlist:', error);
    throw error;
  }
}
import { SpotifyAPI } from '@statsfm/spotify.js';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const USER1_TOKEN = process.env.USER1_TOKEN;
const USER2_TOKEN = process.env.USER2_TOKEN;

async function generateBlend() {
  console.log('Generating your personal blend...\n');
  
  if (!USER1_TOKEN && !USER2_TOKEN) {
  console.log('Missing user tokens! Run: node setup-tokens.js first');
    return;
  }
  // Single user testing support
  let token1 = USER1_TOKEN;
  let token2 = USER2_TOKEN;
  if (!USER1_TOKEN && USER2_TOKEN) token1 = USER2_TOKEN;
  if (!USER2_TOKEN && USER1_TOKEN) token2 = USER1_TOKEN;
  if (token1 === token2) {
  console.log('Single user mode: using the same token for both users. Some blend features will be less meaningful.');
  }

  try {
  // Get data for both users
  console.log('Fetching User 1 data...');
  const user1Data = await getUserData(token1);
    
  console.log('Fetching User 2 data...');
  const user2Data = await getUserData(token2);
    
  console.log('Creating blend algorithm...');
      const blendTracks = await createBlend(user1Data, user2Data);
    
  console.log('Creating playlist...');
    const playlistUrl = await createPlaylist(USER1_TOKEN, blendTracks, user1Data.user, user2Data.user);
    
  console.log(`\nBlend created successfully!`);
  console.log(`Playlist: ${playlistUrl}`);
  console.log(`${blendTracks.length} tracks added`);
    
    // Show some stats
    const genres1 = extractGenres(user1Data.artists);
    const genres2 = extractGenres(user2Data.artists);
    const sharedGenres = genres1.filter(g => genres2.includes(g));
    
  console.log(`\nBlend Stats:`);
  console.log(`   Shared genres: ${sharedGenres.length > 0 ? sharedGenres.slice(0, 3).join(', ') : 'None found'}`);
  console.log(`   User 1 favorites: ${Math.round(blendTracks.filter(t => t.source === 'user1').length / blendTracks.length * 100)}%`);
  console.log(`   User 2 favorites: ${Math.round(blendTracks.filter(t => t.source === 'user2').length / blendTracks.length * 100)}%`);
  console.log(`   Discovery tracks: ${Math.round(blendTracks.filter(t => t.source === 'discovery').length / blendTracks.length * 100)}%`);
    
  } catch (error) {
  console.error('Error generating blend:', error.message);
    
    if (error.message.includes('401')) {
      console.log('\nYour tokens might have expired. Run: node setup-tokens.js');
    }
  }
}

async function getUserData(token) {
  // Check token scopes and log them
  try {
    const tokenInfo = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
  console.log(`Token for user ${tokenInfo.data.display_name || tokenInfo.data.id} is valid.`);
  } catch (err) {
  console.error('Token is invalid or expired:', err.response?.data || err.message);
  }
  async function getTop(type, time_range, limit) {
    const url = `https://api.spotify.com/v1/me/top/${type}?time_range=${time_range}&limit=${limit}`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    return response.data;
  }
  const api = new SpotifyAPI({
    clientCredentials: {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    },
    accessToken: token
  });

    // Debug: Check available methods on api.me
    console.log('typeof api.me.topTracks:', typeof api.me.topTracks);
    console.log('typeof api.me.topArtists:', typeof api.me.topArtists);
    console.log('typeof api.me.top:', typeof api.me.top);
  try {
    console.log('Calling api.me.top for short_term tracks');
    console.log('Params:', { time_range: 'short_term', limit: 30 });
    console.log('Calling api.me.top for medium_term tracks');
    console.log('Params:', { time_range: 'medium_term', limit: 20 });
    console.log('Calling api.me.top for long_term tracks');
    console.log('Params:', { time_range: 'long_term', limit: 10 });
    console.log('Calling api.me.top for medium_term artists');
    console.log('Params:', { time_range: 'medium_term', limit: 20 });
      const [user, shortTerm, mediumTerm, longTerm, recentTracks, topArtists] = await Promise.all([
        api.me.get(),
        getTop('tracks', 'short_term', 30),
        getTop('tracks', 'medium_term', 20),
        getTop('tracks', 'long_term', 10),
        api.me.recentlyPlayed({ limit: 20 }),
        getTop('artists', 'medium_term', 20)
      ]);

    return {
      user,
      shortTerm: shortTerm.items,
      mediumTerm: mediumTerm.items,
      longTerm: longTerm.items,
      recentTracks: recentTracks.items.map(item => item.track),
      artists: topArtists.items
    };
  } catch (error) {
    console.error('Error fetching user data:', error);
    throw error;
  }
}

async function createBlend(user1Data, user2Data) {
  const fs = await import('fs/promises');
  const historyPath = 'c:/Users/quird/code/my-blend/.blend-history.json';
  let historyIds = [];
  try {
    const historyRaw = await fs.readFile(historyPath, 'utf8');
    const historyData = JSON.parse(historyRaw);
    // Support multiple blends: { blends: [ { trackIds: [...] }, ... ] }
    if (Array.isArray(historyData.blends)) {
      // Get trackIds from last two blends
      const lastBlends = historyData.blends.slice(-2);
      historyIds = lastBlends.flatMap(b => b.trackIds || []);
    } else if (Array.isArray(historyData.trackIds)) {
      // Legacy: single blend
      historyIds = historyData.trackIds;
    }
  } catch (err) {
    // No history file yet
  }

  const tracks = [];
  const targetLength = 50;

  // 1. Shared recent tracks
  const user1RecentIds = new Set(user1Data.recentTracks.map(t => t.id));
  const user2RecentIds = new Set(user2Data.recentTracks.map(t => t.id));
  const sharedRecent = user1Data.recentTracks.filter(t => user2RecentIds.has(t.id));
  for (let i = 0; i < sharedRecent.length && tracks.length < targetLength * 0.3; i++) {
    if (!historyIds.includes(sharedRecent[i].id)) {
      tracks.push({ ...sharedRecent[i], source: 'shared-recent' });
    }
  }

  // 2. Top tracks from both users (short, medium, long term)
  const allTopTracks = [
    ...user1Data.shortTerm,
    ...user2Data.shortTerm,
    ...user1Data.mediumTerm,
    ...user2Data.mediumTerm,
    ...user1Data.longTerm,
    ...user2Data.longTerm
  ];
  // Prioritize tracks with shared artists
  const user1ArtistIds = new Set(user1Data.artists.map(a => a.id));
  const user2ArtistIds = new Set(user2Data.artists.map(a => a.id));
  for (const track of allTopTracks) {
    const mainArtist = track.artists[0]?.id;
    if (user1ArtistIds.has(mainArtist) && user2ArtistIds.has(mainArtist) && tracks.length < targetLength * 0.5) {
      if (!historyIds.includes(track.id)) {
        tracks.push({ ...track, source: 'shared-artist' });
      }
    }
  }

  // 3. Fill with diverse tracks by genre and artist
  const genreCount = {};
  const artistCount = {};
  for (const track of allTopTracks) {
    const mainArtist = track.artists[0]?.id;
    artistCount[mainArtist] = (artistCount[mainArtist] || 0) + 1;
    if (artistCount[mainArtist] > 2) continue;
    let trackGenres = [];
    if (track.artists[0]?.genres) trackGenres = track.artists[0].genres;
    let genreOk = true;
    for (const genre of trackGenres) {
      genreCount[genre] = (genreCount[genre] || 0) + 1;
      if (genreCount[genre] > 5) genreOk = false;
    }
    if (!genreOk) continue;
    if (!historyIds.includes(track.id)) {
      tracks.push({ ...track, source: 'diversity' });
    }
    if (tracks.length >= targetLength) break;
  }

  // 4. Allow up to 10% repeats for favorites if not enough tracks
  if (tracks.length < targetLength && historyIds.length > 0) {
    const repeatsAllowed = Math.floor(targetLength * 0.1);
    let repeatsAdded = 0;
    for (const track of allTopTracks) {
      if (tracks.length >= targetLength) break;
      if (historyIds.includes(track.id) && repeatsAdded < repeatsAllowed) {
        tracks.push({ ...track, source: 'repeat' });
        repeatsAdded++;
      }
    }
  }

  // Remove duplicates and shuffle
  const uniqueTracks = removeDuplicates(tracks);

  // Save new blend history (append to blends array, keep last 2)
  try {
    let blends = [];
    try {
      const historyRaw = await fs.readFile(historyPath, 'utf8');
      const historyData = JSON.parse(historyRaw);
      if (Array.isArray(historyData.blends)) blends = historyData.blends;
    } catch {}
    blends.push({ trackIds: uniqueTracks.map(t => t.id) });
    if (blends.length > 2) blends = blends.slice(-2);
    await fs.writeFile(historyPath, JSON.stringify({ blends }), 'utf8');
  } catch (err) {
    // Ignore write errors
  }

  return shuffleTracks(uniqueTracks).slice(0, targetLength);
}

// Run the blend generator
generateBlend();