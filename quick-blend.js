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
    if (!Array.isArray(shuffled[i].artists) || shuffled[i].artists.length === 0) continue;
    if (!Array.isArray(shuffled[i-1].artists) || shuffled[i-1].artists.length === 0) continue;
    if (shuffled[i].artists[0]?.id === shuffled[i-1].artists[0]?.id) {
      for (let j = i + 1; j < shuffled.length; j++) {
        if (!Array.isArray(shuffled[j].artists) || shuffled[j].artists.length === 0) continue;
        if (shuffled[j].artists[0]?.id !== shuffled[i-1].artists[0]?.id) {
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
  const path = './.blend-playlist.json';
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
          public: false,
          collaborative: true
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
  const fs = await import('fs');
  function getLatestToken(userKey) {
    if (fs.existsSync('.tokens.json')) {
      const allTokens = JSON.parse(fs.readFileSync('.tokens.json', 'utf8'));
      return allTokens[userKey]?.accessToken || null;
    }
    return null;
  }
  let token1 = getLatestToken('user') || USER1_TOKEN;
  let token2 = getLatestToken('user2') || USER2_TOKEN;
  if (!token1 && token2) token1 = token2;
  if (!token2 && token1) token2 = token1;
  if (token1 === token2) {
    console.log('Single user mode: using the same token for both users. Some blend features will be less meaningful.');
  }
  // Helper to always reload latest token after refresh
  function reloadTokens() {
    token1 = getLatestToken('user') || USER1_TOKEN;
    token2 = getLatestToken('user2') || USER2_TOKEN;
    if (!token1 && token2) token1 = token2;
    if (!token2 && token1) token2 = token1;
  }

  try {
    // Read blend-config.json
    let blendConfig = { blendStyle: 'creative', discoveryPercent: 20, playlistLength: 50 };
    try {
      const fs = await import('fs');
      const configRaw = fs.readFileSync('c:/Users/quird/code/my-blend/blend-config.json', 'utf8');
      blendConfig = JSON.parse(configRaw);
    } catch (err) {
      console.warn('Could not read blend-config.json, using defaults.', err.message);
    }

    // Get data for both users, refresh tokens if needed
    console.log('Fetching User 1 data...');
    let user1Data;
    try {
      user1Data = await getUserData(token1);
    } catch (err) {
      if (err.response && err.response.status === 401) {
        console.log('User 1 token expired, refreshing...');
        const { refreshAccessToken } = await import('./auth.mjs');
        await refreshAccessToken('user');
        reloadTokens();
        user1Data = await getUserData(token1);
      } else {
        throw err;
      }
    }

    console.log('Fetching User 2 data...');
    let user2Data;
    try {
      user2Data = await getUserData(token2);
    } catch (err) {
      if (err.response && err.response.status === 401) {
        console.log('User 2 token expired, refreshing...');
        const { refreshAccessToken } = await import('./auth.mjs');
        await refreshAccessToken('user2');
        reloadTokens();
        user2Data = await getUserData(token2);
      } else {
        throw err;
      }
    }

    console.log('Creating blend algorithm...');
    let blendTracks = await createBlend(user1Data, user2Data, blendConfig);
    // Filter out null/invalid tracks before playlist creation and stats
    blendTracks = Array.isArray(blendTracks) ? blendTracks.filter(t => t && typeof t === 'object' && t.id) : [];
    if (blendTracks.length === 0) {
      console.error('No valid blend tracks after filtering. Check API errors above.');
    }

    // Defensive: check user data and blendTracks before proceeding
    if (!user1Data || !user2Data) {
      console.error('Error: Missing user data.');
      return;
    }
    if (!Array.isArray(blendTracks) || blendTracks.length === 0) {
      console.error('Error: No valid blend tracks generated.');
      return;
    }

    console.log('Creating playlist...');
    const playlistUrl = await createPlaylist(token1, blendTracks, user1Data.user, user2Data.user);

    console.log(`\nBlend created successfully!`);
    console.log(`Playlist: ${playlistUrl}`);
    console.log(`${blendTracks.length} tracks added`);

    // Always show blend stats, with fallback values if blendTracks is empty/null
    let validBlendTracks = blendTracks;

    const genres1 = extractGenres(user1Data.artists || []);
    const genres2 = extractGenres(user2Data.artists || []);
    const sharedGenres = genres1.filter(g => genres2.includes(g));

    // Taste match calculation (based on top artists and top tracks)
    const user1TopArtistIds = new Set((user1Data.artists || []).map(a => a.id));
    const user2TopArtistIds = new Set((user2Data.artists || []).map(a => a.id));
    const sharedArtistCount = [...user1TopArtistIds].filter(id => user2TopArtistIds.has(id)).length;
    const totalUniqueArtists = new Set([...user1TopArtistIds, ...user2TopArtistIds]).size;
    const artistMatchPercent = totalUniqueArtists > 0 ? Math.round(sharedArtistCount / totalUniqueArtists * 100) : 0;

    const user1TopTrackIds = new Set([
      ...(user1Data.shortTerm || []),
      ...(user1Data.mediumTerm || []),
      ...(user1Data.longTerm || [])
    ].map(t => t.id));
    const user2TopTrackIds = new Set([
      ...(user2Data.shortTerm || []),
      ...(user2Data.mediumTerm || []),
      ...(user2Data.longTerm || [])
    ].map(t => t.id));
    const sharedTrackCount = [...user1TopTrackIds].filter(id => user2TopTrackIds.has(id)).length;
    const totalUniqueTracks = new Set([...user1TopTrackIds, ...user2TopTrackIds]).size;
    const trackMatchPercent = totalUniqueTracks > 0 ? Math.round(sharedTrackCount / totalUniqueTracks * 100) : 0;

    // Combined taste match (average of artist and track match)
    const tasteMatchPercent = Math.round((artistMatchPercent + trackMatchPercent) / 2);

    // Playlist Overlap: tracks in both users' playlists
    const user1PlaylistTrackIds = new Set((user1Data.playlistTracks || []).map(t => t.id));
    const user2PlaylistTrackIds = new Set((user2Data.playlistTracks || []).map(t => t.id));
    const playlistOverlapCount = [...user1PlaylistTrackIds].filter(id => user2PlaylistTrackIds.has(id)).length;

    // Blend Source Breakdown
    let sourceCounts = {};
    if (validBlendTracks.length > 0) {
      sourceCounts = validBlendTracks.reduce((acc, t) => {
        acc[t.source] = (acc[t.source] || 0) + 1;
        return acc;
      }, {});
    }

    // First-time Blend Tracks
    let historyIds = [];
    let firstTimeTracks = 0;
    try {
      const fs = await import('fs/promises');
      const historyRaw = await fs.readFile('./.blend-history.json', 'utf8');
      const historyData = JSON.parse(historyRaw);
      if (Array.isArray(historyData.blends)) {
        const lastBlends = historyData.blends.slice(-2);
        historyIds = lastBlends.flatMap(b => b.trackIds || []);
      } else if (Array.isArray(historyData.trackIds)) {
        historyIds = historyData.trackIds;
      }
      if (validBlendTracks.length > 0) {
        firstTimeTracks = validBlendTracks.filter(t => !historyIds.includes(t.id)).length;
      }
    } catch {}

    console.log(`\nBlend Stats:`);
    console.log(`   Shared genres: ${sharedGenres.length > 0 ? sharedGenres.slice(0, 3).join(', ') : 'None found'}`);
    console.log(`   Taste match: ${tasteMatchPercent}% (artists: ${artistMatchPercent}%, tracks: ${trackMatchPercent}%)`);
    console.log(`   Playlist overlap: ${playlistOverlapCount} tracks`);
    console.log(`   Blend source breakdown:`);
    if (Object.keys(sourceCounts).length > 0) {
      Object.entries(sourceCounts).forEach(([source, count]) => {
        console.log(`      ${source}: ${count}`);
      });
    } else {
      console.log('      No blend tracks');
    }
    console.log(`   First-time blend tracks: ${firstTimeTracks}`);
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

  // Fetch liked songs (saved tracks)
  async function getLikedSongs(limit = 100) {
    let liked = [];
    let nextUrl = `https://api.spotify.com/v1/me/tracks?limit=${limit}`;
    while (nextUrl) {
      const res = await axios.get(nextUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      liked = liked.concat(res.data.items.map(item => item.track));
      nextUrl = res.data.next;
    }
    return liked;
  }

  // Fetch saved albums
  async function getSavedAlbums(limit = 50) {
    let albums = [];
    let nextUrl = `https://api.spotify.com/v1/me/albums?limit=${limit}`;
    while (nextUrl) {
      try {
        const res = await axios.get(nextUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        albums = albums.concat(res.data.items.map(item => item.album));
        nextUrl = res.data.next;
      } catch (err) {
        console.error('Failed to fetch saved albums:', err.response?.data || err.message);
        break;
      }
    }
    // Flatten to tracks
    let albumTracks = [];
    for (const album of albums) {
      if (album.tracks && album.tracks.items) {
        albumTracks = albumTracks.concat(album.tracks.items);
      } else if (album.id) {
        try {
          const albumRes = await axios.get(`https://api.spotify.com/v1/albums/${album.id}/tracks`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          albumTracks = albumTracks.concat(albumRes.data.items);
        } catch (err) {
          console.error(`Failed to fetch tracks for album ${album.name || album.id}:`, err.response?.data || err.message);
        }
      }
    }
    // Filter out null tracks
    return albumTracks.filter(t => t && typeof t === 'object' && t.id);
  }

  // Fetch tracks from public/collaborative playlists
  async function getPlaylistTracks(limit = 50) {
    let playlists = [];
    let nextUrl = `https://api.spotify.com/v1/me/playlists?limit=${limit}`;
    while (nextUrl) {
      try {
        const res = await axios.get(nextUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        playlists = playlists.concat(res.data.items);
        nextUrl = res.data.next;
      } catch (err) {
        console.error('Failed to fetch playlists:', err.response?.data || err.message);
        break;
      }
    }
    // Only public/collaborative playlists
    playlists = playlists.filter(p => p.public || p.collaborative);
    let playlistTracks = [];
    for (const playlist of playlists) {
      let nextTrackUrl = `https://api.spotify.com/v1/playlists/${playlist.id}/tracks?limit=100`;
      while (nextTrackUrl) {
        try {
          const trackRes = await axios.get(nextTrackUrl, {
            headers: { Authorization: `Bearer ${token}` }
          });
          playlistTracks = playlistTracks.concat(trackRes.data.items.map(item => item.track));
          nextTrackUrl = trackRes.data.next;
        } catch (err) {
          console.error(`Failed to fetch tracks for playlist ${playlist.name}:`, err.response?.data || err.message);
          break;
        }
      }
    }
    // Filter out null tracks
    return playlistTracks.filter(t => t && typeof t === 'object' && t.id);
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
      const [user, shortTerm, mediumTerm, longTerm, recentTracks, topArtists, likedSongs, savedAlbumTracks, playlistTracks] = await Promise.all([
        api.me.get(),
        getTop('tracks', 'short_term', 30),
        getTop('tracks', 'medium_term', 20),
        getTop('tracks', 'long_term', 10),
        api.me.recentlyPlayed({ limit: 20 }),
        getTop('artists', 'medium_term', 20),
        getLikedSongs(50),
        getSavedAlbums(20),
        getPlaylistTracks(20)
      ]);

    return {
      user,
      shortTerm: shortTerm.items,
      mediumTerm: mediumTerm.items,
      longTerm: longTerm.items,
      recentTracks: recentTracks.items.map(item => item.track),
      artists: topArtists.items,
      likedSongs,
      savedAlbumTracks,
      playlistTracks
    };
  } catch (error) {
    console.error('Error fetching user data:', error);
    throw error;
  }
}

async function createBlend(user1Data, user2Data, blendConfig = { blendStyle: 'creative', discoveryPercent: 20, playlistLength: 50 }) {
  const fs = await import('fs/promises');
  const historyPath = 'c:/Users/quird/code/my-blend/.blend-history.json';
  let historyIds = [];
  // Load blend history
  try {
    const historyRaw = await fs.readFile(historyPath, 'utf8');
    const historyData = JSON.parse(historyRaw);
    if (Array.isArray(historyData.blends)) {
      const lastBlends = historyData.blends.slice(-2);
      historyIds = lastBlends.flatMap(b => b.trackIds || []);
    } else if (Array.isArray(historyData.trackIds)) {
      historyIds = historyData.trackIds;
    }
  } catch (err) {}

  // Load always-include and block-artists
  let alwaysIncludeIds = [];
  let blockArtistIds = [];
  try {
    const alwaysRaw = await fs.readFile('c:/Users/quird/code/my-blend/always-include.json', 'utf8');
    alwaysIncludeIds = JSON.parse(alwaysRaw);
  } catch {}
  try {
    const blockRaw = await fs.readFile('c:/Users/quird/code/my-blend/block-artists.json', 'utf8');
    blockArtistIds = JSON.parse(blockRaw);
  } catch {}

  const tracks = [];
  // Use playlistLength from config
  const targetLength = blendConfig.playlistLength || 50;
  // Use discoveryPercent from config
  const discoveryPercent = blendConfig.discoveryPercent || 20;
  // Use blendStyle from config
  const blendStyle = blendConfig.blendStyle || 'creative';

  // 0. Always include tracks (once, if not blocked)
  let alwaysIncludedTracks = [];
  const axios = (await import('axios')).default;
  for (const tid of alwaysIncludeIds) {
    // Search all user tracks for this ID
    const allTracks = [
      ...(user1Data.shortTerm || []),
      ...(user2Data.shortTerm || []),
      ...(user1Data.mediumTerm || []),
      ...(user2Data.mediumTerm || []),
      ...(user1Data.longTerm || []),
      ...(user2Data.longTerm || []),
      ...(user1Data.likedSongs || []),
      ...(user2Data.likedSongs || []),
      ...(user1Data.savedAlbumTracks || []),
      ...(user2Data.savedAlbumTracks || []),
      ...(user1Data.playlistTracks || []),
      ...(user2Data.playlistTracks || [])
    ];
    let found = allTracks.find(t => t && t.id === tid);
    // If not found, fetch from Spotify API
    if (!found) {
      try {
        const res = await axios.get(`https://api.spotify.com/v1/tracks/${tid}`, {
          headers: { Authorization: `Bearer ${user1Data.user?.accessToken || user2Data.user?.accessToken || process.env.USER1_TOKEN}` }
        });
        found = res.data;
      } catch (err) {
        console.warn(`Could not fetch track ${tid} from Spotify API:`, err?.response?.data || err.message);
      }
    }
    if (found && Array.isArray(found.artists) && found.artists.length > 0 && !blockArtistIds.includes(found.artists[0].id)) {
      alwaysIncludedTracks.push({ ...found, source: 'always-include' });
    }
  }
  // Add always-included tracks first (ignore history)
  for (const t of alwaysIncludedTracks) {
    tracks.push(t);
  }

  // 1. Blend logic by style
  const user1RecentIds = new Set(user1Data.recentTracks.map(t => t.id));
  const user2RecentIds = new Set(user2Data.recentTracks.map(t => t.id));
  const sharedRecent = user1Data.recentTracks.filter(t => user2RecentIds.has(t.id));
  const allTopTracks = [
    ...(user1Data.shortTerm || []),
    ...(user2Data.shortTerm || []),
    ...(user1Data.mediumTerm || []),
    ...(user2Data.mediumTerm || []),
    ...(user1Data.longTerm || []),
    ...(user2Data.longTerm || []),
    ...(user1Data.likedSongs || []),
    ...(user2Data.likedSongs || []),
    ...(user1Data.savedAlbumTracks || []),
    ...(user2Data.savedAlbumTracks || []),
    ...(user1Data.playlistTracks || []),
    ...(user2Data.playlistTracks || [])
  ];
  const user1ArtistIds = new Set((user1Data.artists || []).map(a => a.id));
  const user2ArtistIds = new Set((user2Data.artists || []).map(a => a.id));

  if (blendStyle === 'classic') {
    // Only tracks both users have played, liked, or saved
    for (const track of allTopTracks) {
      if (!track || typeof track !== 'object') continue;
      if (!Array.isArray(track.artists) || track.artists.length === 0) continue;
      const mainArtist = track.artists[0]?.id;
      if (blockArtistIds.includes(mainArtist)) continue;
      // Track must appear in both users' pools
      const inUser1 = [
        ...(user1Data.shortTerm || []),
        ...(user1Data.mediumTerm || []),
        ...(user1Data.longTerm || []),
        ...(user1Data.likedSongs || []),
        ...(user1Data.savedAlbumTracks || []),
        ...(user1Data.playlistTracks || [])
      ].some(t => t && t.id === track.id);
      const inUser2 = [
        ...(user2Data.shortTerm || []),
        ...(user2Data.mediumTerm || []),
        ...(user2Data.longTerm || []),
        ...(user2Data.likedSongs || []),
        ...(user2Data.savedAlbumTracks || []),
        ...(user2Data.playlistTracks || [])
      ].some(t => t && t.id === track.id);
      if (inUser1 && inUser2 && !historyIds.includes(track.id)) {
        tracks.push({ ...track, source: 'classic' });
      }
      if (tracks.length >= targetLength) break;
    }
  } else if (blendStyle === 'wild') {
    // Maximize variety and discovery
    // Add shared recent tracks first
    for (let i = 0; i < sharedRecent.length && tracks.length < targetLength * 0.2; i++) {
      const track = sharedRecent[i];
      if (!historyIds.includes(track.id) && Array.isArray(track.artists) && track.artists.length > 0 && !blockArtistIds.includes(track.artists[0].id)) {
        tracks.push({ ...track, source: 'shared-recent' });
      }
    }
    // Add discovery tracks (higher percent)
    if (discoveryPercent > 0 && tracks.length < targetLength) {
      try {
        const seedArtists = [
          ...(user1Data.artists || []).slice(0, 3).map(a => a.id),
          ...(user2Data.artists || []).slice(0, 3).map(a => a.id)
        ].filter(Boolean);
        const seedGenres = [
          ...(user1Data.artists || []).flatMap(a => a.genres || []),
          ...(user2Data.artists || []).flatMap(a => a.genres || [])
        ];
        const seedTracks = [
          ...(user1Data.shortTerm || []).slice(0, 3).map(t => t.id),
          ...(user2Data.shortTerm || []).slice(0, 3).map(t => t.id)
        ].filter(Boolean);
        const seeds = {
          seed_artists: seedArtists.slice(0, 3).join(','),
          seed_genres: seedGenres.slice(0, 3).join(','),
          seed_tracks: seedTracks.slice(0, 2).join(',')
        };
        const recRes = await axios.get(`https://api.spotify.com/v1/recommendations?limit=${Math.floor(targetLength * (discoveryPercent / 100))}&${Object.entries(seeds).map(([k, v]) => `${k}=${v}`).join('&')}`, {
          headers: { Authorization: `Bearer ${user1Data.user?.accessToken || user2Data.user?.accessToken || process.env.USER1_TOKEN}` }
        });
        const recTracks = recRes.data.tracks || [];
        for (const track of recTracks) {
          if (!track || typeof track !== 'object') continue;
          if (!Array.isArray(track.artists) || track.artists.length === 0) continue;
          const mainArtist = track.artists[0]?.id;
          if (blockArtistIds.includes(mainArtist)) continue;
          if (!historyIds.includes(track.id)) {
            tracks.push({ ...track, source: 'wild-discovery' });
          }
          if (tracks.length >= targetLength) break;
        }
      } catch (err) {
        console.warn('Could not fetch wild discovery tracks:', err?.response?.data || err.message);
      }
    }
    // Fill with diverse tracks from both users
    for (const track of allTopTracks) {
      if (!track || typeof track !== 'object') continue;
      if (!Array.isArray(track.artists) || track.artists.length === 0) continue;
      const mainArtist = track.artists[0]?.id;
      if (blockArtistIds.includes(mainArtist)) continue;
      if (!historyIds.includes(track.id)) {
        tracks.push({ ...track, source: 'wild-diversity' });
      }
      if (tracks.length >= targetLength) break;
    }
  } else {
    // creative (default): shared recent, shared artists, discovery, diversity
    for (let i = 0; i < sharedRecent.length && tracks.length < targetLength * 0.3; i++) {
      const track = sharedRecent[i];
      if (!historyIds.includes(track.id) && Array.isArray(track.artists) && track.artists.length > 0 && !blockArtistIds.includes(track.artists[0].id)) {
        tracks.push({ ...track, source: 'shared-recent' });
      }
    }
    for (const track of allTopTracks) {
      if (!track || typeof track !== 'object') continue;
      if (!Array.isArray(track.artists) || track.artists.length === 0) continue;
      const mainArtist = track.artists[0]?.id;
      if (blockArtistIds.includes(mainArtist)) continue;
      if (mainArtist && user1ArtistIds.has(mainArtist) && user2ArtistIds.has(mainArtist) && tracks.length < targetLength * 0.5) {
        if (!historyIds.includes(track.id)) {
          tracks.push({ ...track, source: 'shared-artist' });
        }
      }
    }
    if (discoveryPercent > 0 && tracks.length < targetLength) {
      try {
        const seedArtists = [
          ...(user1Data.artists || []).slice(0, 2).map(a => a.id),
          ...(user2Data.artists || []).slice(0, 2).map(a => a.id)
        ].filter(Boolean);
        const seedGenres = [
          ...(user1Data.artists || []).flatMap(a => a.genres || []),
          ...(user2Data.artists || []).flatMap(a => a.genres || [])
        ];
        const seedTracks = [
          ...(user1Data.shortTerm || []).slice(0, 2).map(t => t.id),
          ...(user2Data.shortTerm || []).slice(0, 2).map(t => t.id)
        ].filter(Boolean);
        const seeds = {
          seed_artists: seedArtists.slice(0, 2).join(','),
          seed_genres: seedGenres.slice(0, 2).join(','),
          seed_tracks: seedTracks.slice(0, 1).join(',')
        };
        const recRes = await axios.get(`https://api.spotify.com/v1/recommendations?limit=${Math.floor(targetLength * (discoveryPercent / 100))}&${Object.entries(seeds).map(([k, v]) => `${k}=${v}`).join('&')}`, {
          headers: { Authorization: `Bearer ${user1Data.user?.accessToken || user2Data.user?.accessToken || process.env.USER1_TOKEN}` }
        });
        const recTracks = recRes.data.tracks || [];
        for (const track of recTracks) {
          if (!track || typeof track !== 'object') continue;
          if (!Array.isArray(track.artists) || track.artists.length === 0) continue;
          const mainArtist = track.artists[0]?.id;
          if (blockArtistIds.includes(mainArtist)) continue;
          if (!historyIds.includes(track.id)) {
            tracks.push({ ...track, source: 'discovery' });
          }
          if (tracks.length >= targetLength) break;
        }
      } catch (err) {
        console.warn('Could not fetch discovery tracks:', err?.response?.data || err.message);
      }
    }
    // Diversity selection (fill remaining slots)
    const genreCount = {};
    const artistCount = {};
    for (const track of allTopTracks) {
      if (!track || typeof track !== 'object') continue;
      if (!Array.isArray(track.artists) || track.artists.length === 0) continue;
      const mainArtist = track.artists[0]?.id;
      if (blockArtistIds.includes(mainArtist)) continue;
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
  }

  // 5. Allow up to 10% repeats for favorites if not enough tracks (skip blocked artists)
  if (tracks.length < targetLength && historyIds.length > 0) {
    const repeatsAllowed = Math.floor(targetLength * 0.1);
    let repeatsAdded = 0;
    for (const track of allTopTracks) {
      if (tracks.length >= targetLength) break;
      if (historyIds.includes(track.id) && repeatsAdded < repeatsAllowed && Array.isArray(track.artists) && track.artists.length > 0 && !blockArtistIds.includes(track.artists[0].id)) {
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