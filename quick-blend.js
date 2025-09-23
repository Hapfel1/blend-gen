import { extractGenres, shuffleTracks, removeDuplicates } from './track-utils.js';
import { createPlaylist } from './playlist-manager.js';
import 'dotenv/config';
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

    // Fetch followed artists and new releases for user 1
    const { getFollowedArtists, getNewReleasesForFollowedArtists } = await import('./spotify-api.js');
    let user1FollowedArtists = await getFollowedArtists(token1, null, 'user');
    let user1NewReleaseTracks = await getNewReleasesForFollowedArtists(token1, user1FollowedArtists.map(a => a.id), null, 'user');

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

    // Fetch followed artists and new releases for user 2
    let user2FollowedArtists = await getFollowedArtists(token2, null, 'user2');
    let user2NewReleaseTracks = await getNewReleasesForFollowedArtists(token2, user2FollowedArtists.map(a => a.id), null, 'user2');

    console.log('Creating blend algorithm...');
    let blendTracks = await createBlend(
      { ...user1Data, newReleaseTracks: user1NewReleaseTracks },
      { ...user2Data, newReleaseTracks: user2NewReleaseTracks },
      blendConfig
    );
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

import { getUserData } from './spotify-api.js';

import { createBlend } from './blend-algorithm.js';

// Run the blend generator
generateBlend();