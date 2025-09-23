
import { shuffleTracks, removeDuplicates } from './track-utils.js';
import axios from 'axios';

export async function createBlend(user1Data, user2Data, blendConfig = { blendStyle: 'creative', discoveryPercent: 20, playlistLength: 50 }) {
  // Add debug log for new releases
  console.log('  user1 newReleaseTracks:', (user1Data.newReleaseTracks || []).length);
  console.log('  user2 newReleaseTracks:', (user2Data.newReleaseTracks || []).length);
  // Load sources config
  const sources = blendConfig.sources || {
    shortTerm: true,
    mediumTerm: true,
    longTerm: true,
    likedSongs: true,
    savedAlbumTracks: true,
    playlistTracks: true,
    recentTracks: true,
    newReleaseTracks: true,
    alwaysInclude: true
  };
  const weighting = blendConfig.weighting || { playCount: false, recency: false };
  const audioFeaturesConfig = blendConfig.audioFeatures || { enabled: false, match: [] };
  // ...existing code...
	const fs = await import('fs/promises');
	const historyPath = 'c:/Users/quird/code/my-blend/.blend-history.json';
	let historyIds = [];
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

  // Load always-include, block-artists, and block-tracks
  let alwaysIncludeIds = [];
  let blockArtistIds = [];
  let blockTrackIds = [];
  try {
    const alwaysRaw = await fs.readFile('c:/Users/quird/code/my-blend/always-include.json', 'utf8');
    alwaysIncludeIds = JSON.parse(alwaysRaw);
  } catch {}
  try {
    const blockRaw = await fs.readFile('c:/Users/quird/code/my-blend/block-artists.json', 'utf8');
    blockArtistIds = JSON.parse(blockRaw);
  } catch {}
  try {
    const blockTrackRaw = await fs.readFile('c:/Users/quird/code/my-blend/block-tracks.json', 'utf8');
    blockTrackIds = JSON.parse(blockTrackRaw);
  } catch {}

  // Debug: log counts for each source (after initialization)
  console.log('Source track counts:');
  if (sources.shortTerm) {
    console.log('  user1 shortTerm:', (user1Data.shortTerm || []).length);
    console.log('  user2 shortTerm:', (user2Data.shortTerm || []).length);
  }
  if (sources.mediumTerm) {
    console.log('  user1 mediumTerm:', (user1Data.mediumTerm || []).length);
    console.log('  user2 mediumTerm:', (user2Data.mediumTerm || []).length);
  }
  if (sources.longTerm) {
    console.log('  user1 longTerm:', (user1Data.longTerm || []).length);
    console.log('  user2 longTerm:', (user2Data.longTerm || []).length);
  }
  if (sources.likedSongs) {
    console.log('  user1 likedSongs:', (user1Data.likedSongs || []).length);
    console.log('  user2 likedSongs:', (user2Data.likedSongs || []).length);
  }
  if (sources.savedAlbumTracks) {
    console.log('  user1 savedAlbumTracks:', (user1Data.savedAlbumTracks || []).length);
    console.log('  user2 savedAlbumTracks:', (user2Data.savedAlbumTracks || []).length);
  }
  if (sources.playlistTracks) {
    console.log('  user1 playlistTracks:', (user1Data.playlistTracks || []).length);
    console.log('  user2 playlistTracks:', (user2Data.playlistTracks || []).length);
  }
  if (sources.recentTracks) {
    console.log('  user1 recentTracks:', (user1Data.recentTracks || []).length);
    console.log('  user2 recentTracks:', (user2Data.recentTracks || []).length);
  }
  if (sources.newReleaseTracks) {
    console.log('  user1 newReleaseTracks:', (user1Data.newReleaseTracks || []).length);
    console.log('  user2 newReleaseTracks:', (user2Data.newReleaseTracks || []).length);
  }
  console.log('  alwaysIncludeIds:', alwaysIncludeIds.length);
  console.log('  blockArtistIds:', blockArtistIds.length);
  console.log('  blockTrackIds:', blockTrackIds.length);

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
  // Import fetchWithRetry from spotify-api.js
  const { fetchWithRetry } = await import('./spotify-api.js');
  const { refreshAccessToken } = await import('./auth.mjs');
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
    if (
      found &&
      Array.isArray(found.artists) && found.artists.length > 0 &&
      !blockArtistIds.includes(found.artists[0].id) &&
      !blockTrackIds.includes(found.id)
    ) {
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
  // Build allTopTracks based on sources config
  let allTopTracks = [];
  if (sources.shortTerm) {
    allTopTracks.push(...(user1Data.shortTerm || []), ...(user2Data.shortTerm || []));
  }
  if (sources.mediumTerm) {
    allTopTracks.push(...(user1Data.mediumTerm || []), ...(user2Data.mediumTerm || []));
  }
  if (sources.longTerm) {
    allTopTracks.push(...(user1Data.longTerm || []), ...(user2Data.longTerm || []));
  }
  if (sources.likedSongs) {
    allTopTracks.push(...(user1Data.likedSongs || []), ...(user2Data.likedSongs || []));
  }
  if (sources.savedAlbumTracks) {
    allTopTracks.push(...(user1Data.savedAlbumTracks || []), ...(user2Data.savedAlbumTracks || []));
  }
  if (sources.playlistTracks) {
    allTopTracks.push(...(user1Data.playlistTracks || []), ...(user2Data.playlistTracks || []));
  }
  if (sources.newReleaseTracks) {
    allTopTracks.push(...(user1Data.newReleaseTracks || []), ...(user2Data.newReleaseTracks || []));
  }
  const user1ArtistIds = new Set((user1Data.artists || []).map(a => a.id));
  const user2ArtistIds = new Set((user2Data.artists || []).map(a => a.id));

  if (blendStyle === 'classic') {
    // Only tracks both users have played, liked, or saved
    for (const track of allTopTracks) {
  if (!track || typeof track !== 'object') continue;
  if (!Array.isArray(track.artists) || track.artists.length === 0) continue;
  const mainArtist = track.artists[0]?.id;
  if (blockArtistIds.includes(mainArtist)) continue;
  if (blockTrackIds.includes(track.id)) continue;
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
      if (
        !historyIds.includes(track.id) &&
        Array.isArray(track.artists) && track.artists.length > 0 &&
        !blockArtistIds.includes(track.artists[0].id) &&
        !blockTrackIds.includes(track.id)
      ) {
        tracks.push({ ...track, source: 'shared-recent' });
      }
    }
    // Add discovery tracks (higher percent)
    if (discoveryPercent > 0 && tracks.length < targetLength) {
      try {
        let seedArtists = [
          ...(user1Data.artists || []).slice(0, 3).map(a => a.id),
          ...(user2Data.artists || []).slice(0, 3).map(a => a.id)
        ].filter(Boolean);
        let seedGenres = [
          ...(user1Data.artists || []).flatMap(a => a.genres || []),
          ...(user2Data.artists || []).flatMap(a => a.genres || [])
        ].filter(Boolean);
        let seedTracks = [
          ...(user1Data.shortTerm || []).slice(0, 3).map(t => t.id),
          ...(user2Data.shortTerm || []).slice(0, 3).map(t => t.id)
        ].filter(Boolean);
        // Fallback: if all seeds are empty, use top tracks from both users
        if (seedArtists.length === 0 && seedGenres.length === 0 && seedTracks.length === 0) {
          seedTracks = [
            ...(user1Data.shortTerm || []).map(t => t.id),
            ...(user2Data.shortTerm || []).map(t => t.id)
          ].filter(Boolean).slice(0, 5);
        }
        // FINAL fallback: if still no seeds, use a default popular track
        if (seedArtists.length === 0 && seedGenres.length === 0 && seedTracks.length === 0) {
          // Example: "3n3Ppam7vgaVa1iaRUc9Lp" is Blinding Lights by The Weeknd
          seedTracks = ["3n3Ppam7vgaVa1iaRUc9Lp"];
        }
        // Only include non-empty seeds in query
        const seeds = {};
        if (seedArtists.length > 0) seeds.seed_artists = seedArtists.slice(0, 3).join(',');
        if (seedGenres.length > 0) seeds.seed_genres = seedGenres.slice(0, 3).join(',');
        if (seedTracks.length > 0) seeds.seed_tracks = seedTracks.slice(0, 2).join(',');
        if (Object.keys(seeds).length === 0) {
          console.warn('No valid seeds for discovery tracks, skipping recommendations API call.');
        } else {
          const recRes = await fetchWithRetry(
            (tk) => axios.get(`https://api.spotify.com/v1/recommendations?limit=${Math.floor(targetLength * (discoveryPercent / 100))}&${Object.entries(seeds).map(([k, v]) => `${k}=${v}`).join('&')}`, {
              headers: { Authorization: `Bearer ${user1Data.user?.accessToken || user2Data.user?.accessToken || tk}` }
            }),
            user1Data.user?.accessToken || user2Data.user?.accessToken,
            refreshAccessToken,
            user1Data.user?.accessToken ? 'user' : 'user2'
          );
          const recTracks = recRes.data.tracks || [];
          for (const track of recTracks) {
            if (!track || typeof track !== 'object') continue;
            if (!Array.isArray(track.artists) || track.artists.length === 0) continue;
            const mainArtist = track.artists[0]?.id;
            if (blockArtistIds.includes(mainArtist)) continue;
            if (blockTrackIds.includes(track.id)) continue;
            if (!historyIds.includes(track.id)) {
              tracks.push({ ...track, source: 'wild-discovery' });
            }
            if (tracks.length >= targetLength) break;
          }
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
      if (blockTrackIds.includes(track.id)) continue;
      if (!historyIds.includes(track.id)) {
        tracks.push({ ...track, source: 'wild-diversity' });
      }
      if (tracks.length >= targetLength) break;
    }
  } else {
    // creative (default): shared recent, shared artists, discovery, diversity
    for (let i = 0; i < sharedRecent.length && tracks.length < targetLength * 0.3; i++) {
      const track = sharedRecent[i];
      if (
        !historyIds.includes(track.id) &&
        Array.isArray(track.artists) && track.artists.length > 0 &&
        !blockArtistIds.includes(track.artists[0].id) &&
        !blockTrackIds.includes(track.id)
      ) {
        tracks.push({ ...track, source: 'shared-recent' });
      }
    }
    for (const track of allTopTracks) {
      if (!track || typeof track !== 'object') continue;
      if (!Array.isArray(track.artists) || track.artists.length === 0) continue;
      const mainArtist = track.artists[0]?.id;
      if (blockArtistIds.includes(mainArtist)) continue;
      if (blockTrackIds.includes(track.id)) continue;
      if (mainArtist && user1ArtistIds.has(mainArtist) && user2ArtistIds.has(mainArtist) && tracks.length < targetLength * 0.5) {
        if (!historyIds.includes(track.id)) {
          tracks.push({ ...track, source: 'shared-artist' });
        }
      }
    }
    if (discoveryPercent > 0 && tracks.length < targetLength) {
      try {
        let seedArtists = [
          ...(user1Data.artists || []).slice(0, 2).map(a => a.id),
          ...(user2Data.artists || []).slice(0, 2).map(a => a.id)
        ].filter(Boolean);
        let seedGenres = [
          ...(user1Data.artists || []).flatMap(a => a.genres || []),
          ...(user2Data.artists || []).flatMap(a => a.genres || [])
        ].filter(Boolean);
        let seedTracks = [
          ...(user1Data.shortTerm || []).slice(0, 2).map(t => t.id),
          ...(user2Data.shortTerm || []).slice(0, 2).map(t => t.id)
        ].filter(Boolean);
        // Fallback: if all seeds are empty, use top tracks from both users
        if (seedArtists.length === 0 && seedGenres.length === 0 && seedTracks.length === 0) {
          seedTracks = [
            ...(user1Data.shortTerm || []).map(t => t.id),
            ...(user2Data.shortTerm || []).map(t => t.id)
          ].filter(Boolean).slice(0, 5);
        }
        // FINAL fallback: if still no seeds, use a default popular track
        if (seedArtists.length === 0 && seedGenres.length === 0 && seedTracks.length === 0) {
          seedTracks = ["3n3Ppam7vgaVa1iaRUc9Lp"];
        }
        // Only include non-empty seeds in query
        const seeds = {};
        if (seedArtists.length > 0) seeds.seed_artists = seedArtists.slice(0, 2).join(',');
        if (seedGenres.length > 0) seeds.seed_genres = seedGenres.slice(0, 2).join(',');
        if (seedTracks.length > 0) seeds.seed_tracks = seedTracks.slice(0, 1).join(',');
        if (Object.keys(seeds).length === 0) {
          console.warn('No valid seeds for discovery tracks, skipping recommendations API call.');
        } else {
          const recRes = await fetchWithRetry(
            (tk) => axios.get(`https://api.spotify.com/v1/recommendations?limit=${Math.floor(targetLength * (discoveryPercent / 100))}&${Object.entries(seeds).map(([k, v]) => `${k}=${v}`).join('&')}`, {
              headers: { Authorization: `Bearer ${user1Data.user?.accessToken || user2Data.user?.accessToken || tk}` }
            }),
            user1Data.user?.accessToken || user2Data.user?.accessToken,
            refreshAccessToken,
            user1Data.user?.accessToken ? 'user' : 'user2'
          );
          const recTracks = recRes.data.tracks || [];
          for (const track of recTracks) {
            if (!track || typeof track !== 'object') continue;
            if (!Array.isArray(track.artists) || track.artists.length === 0) continue;
            const mainArtist = track.artists[0]?.id;
            if (blockArtistIds.includes(mainArtist)) continue;
            if (blockTrackIds.includes(track.id)) continue;
            if (!historyIds.includes(track.id)) {
              tracks.push({ ...track, source: 'discovery' });
            }
            if (tracks.length >= targetLength) break;
          }
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
      if (blockTrackIds.includes(track.id)) continue;
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
      if (
        historyIds.includes(track.id) &&
        repeatsAdded < repeatsAllowed &&
        Array.isArray(track.artists) && track.artists.length > 0 &&
        !blockArtistIds.includes(track.artists[0].id) &&
        !blockTrackIds.includes(track.id)
      ) {
        tracks.push({ ...track, source: 'repeat' });
        repeatsAdded++;
      }
    }
  }

  // Weighting by play count/recency
  if (weighting.playCount || weighting.recency) {
    // Assign score to each track
    for (const track of allTopTracks) {
      let score = 0;
      if (weighting.playCount && typeof track.playCount === 'number') score += track.playCount;
      if (weighting.recency && typeof track.playedAt === 'number') score += (Date.now() - track.playedAt) / (1000 * 60 * 60 * 24); // days ago
      track._score = score;
    }
    // Sort by score descending
    allTopTracks = allTopTracks.sort((a, b) => (b._score || 0) - (a._score || 0));
  }

  // Audio features matching
  if (audioFeaturesConfig.enabled && Array.isArray(audioFeaturesConfig.match) && audioFeaturesConfig.match.length > 0) {
    const { getAudioFeatures } = await import('./spotify-api.js');
    const allTrackIds = allTopTracks.map(t => t.id).filter(Boolean);
    const features = await getAudioFeatures(user1Data.user?.accessToken || user2Data.user?.accessToken, allTrackIds, refreshAccessToken, user1Data.user?.accessToken ? 'user' : 'user2');
    // Filter tracks by feature similarity (simple: keep tracks within 1 stddev of mean for each feature)
    for (const featureName of audioFeaturesConfig.match) {
      const values = Object.values(features).map(f => typeof f[featureName] === 'number' ? f[featureName] : null).filter(v => v !== null);
      if (values.length === 0) continue;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const stddev = Math.sqrt(values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length);
      allTopTracks = allTopTracks.filter(t => {
        const f = features[t.id];
        return f && typeof f[featureName] === 'number' && Math.abs(f[featureName] - mean) <= stddev;
      });
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

