
import { shuffleTracks, removeDuplicates } from './track-utils.js';
import axios from 'axios';

export async function createBlend(user1Data, user2Data, blendConfig = { blendStyle: 'creative', discoveryPercent: 20, playlistLength: 50 }) {
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

