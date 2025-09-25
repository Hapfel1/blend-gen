// Fetch audio features for a list of track IDs
export async function getAudioFeatures(token, trackIds, refreshFn = null, userKey = 'user') {
  if (!Array.isArray(trackIds) || trackIds.length === 0) return {};
  const features = {};
  // Spotify API allows up to 100 IDs per request
  for (let i = 0; i < trackIds.length; i += 100) {
    const batch = trackIds.slice(i, i + 100);
    try {
      const res = await fetchWithRetry(
        (tk) => axios.get(`https://api.spotify.com/v1/audio-features?ids=${batch.join(',')}`, { headers: { Authorization: `Bearer ${tk}` } }),
        token, refreshFn, userKey
      );
      for (const f of res.data.audio_features) {
        if (f && f.id) features[f.id] = f;
      }
    } catch (err) {
      console.warn('Failed to fetch audio features:', err?.response?.data || err.message);
    }
  }
  return features;
}
// Fetch user's followed artists
export async function getFollowedArtists(token, refreshFn = null, userKey = 'user', limit = 50) {
  let artists = [];
  let nextUrl = `https://api.spotify.com/v1/me/following?type=artist&limit=${limit}`;
  while (nextUrl) {
    const res = await fetchWithRetry(
      (tk) => axios.get(nextUrl, { headers: { Authorization: `Bearer ${tk}` } }),
      token, refreshFn, userKey
    );
    artists = artists.concat(res.data.artists.items);
    nextUrl = res.data.artists.next;
  }
  return artists;
}

// Fetch new releases for a list of artist IDs
export async function getNewReleasesForFollowedArtists(token, artistIds, refreshFn = null, userKey = 'user') {
  let newReleaseTracks = [];
  for (const artistId of artistIds) {
    try {
      const albumsRes = await fetchWithRetry(
        (tk) => axios.get(`https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=5`, { headers: { Authorization: `Bearer ${tk}` } }),
        token, refreshFn, userKey
      );
      const albums = albumsRes.data.items;
      for (const album of albums) {
        const tracksRes = await fetchWithRetry(
          (tk) => axios.get(`https://api.spotify.com/v1/albums/${album.id}/tracks`, { headers: { Authorization: `Bearer ${tk}` } }),
          token, refreshFn, userKey
        );
        newReleaseTracks = newReleaseTracks.concat(tracksRes.data.items);
      }
    } catch (err) {
      console.warn(`Failed to fetch new releases for artist ${artistId}:`, err?.response?.data || err.message);
    }
  }
  return newReleaseTracks.filter(t => t && typeof t === 'object' && t.id);
}
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
import axios from 'axios';
import { SpotifyAPI } from '@statsfm/spotify.js';

// Universal fetch with retry on 401
export async function fetchWithRetry(requestFn, token, refreshFn, userKey) {
  let triedRefresh = false;
  let latestToken = token;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await requestFn(latestToken);
    } catch (err) {
      if (!triedRefresh && err?.response?.status === 401 && refreshFn) {
        triedRefresh = true;
        await refreshFn(userKey);
        // Reload token from .tokens.json if needed
        const fs = await import('fs');
        if (fs.existsSync('.tokens.json')) {
          const allTokens = JSON.parse(fs.readFileSync('.tokens.json', 'utf8'));
          latestToken = allTokens[userKey]?.accessToken || latestToken;
        }
        continue;
      } else {
        throw err;
      }
    }
  }
  throw new Error('Failed to fetch after token refresh');
}

export async function getUserData(token, refreshFn = null, userKey = 'user') {
  try {
    const tokenInfo = await fetchWithRetry(
      (tk) => axios.get('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${tk}` } }),
      token, refreshFn, userKey
    );
    console.log(`Token for user ${tokenInfo.data.display_name || tokenInfo.data.id} is valid.`);
  } catch (err) {
    console.error('Token is invalid or expired:', err.response?.data || err.message);
  }

  async function getTop(type, time_range, limit) {
    const url = `https://api.spotify.com/v1/me/top/${type}?time_range=${time_range}&limit=${limit}`;
    try {
      const res = await fetchWithRetry(
        (tk) => axios.get(url, { headers: { Authorization: `Bearer ${tk}` } }),
        token, refreshFn, userKey
      );
      return res.data;
    } catch (err) {
      console.error(`[ERROR] getTop: ${url}`);
      if (err.response) {
        console.error('Status:', err.response.status);
        console.error('Data:', err.response.data);
        console.error('Headers:', err.response.headers);
      } else {
        console.error('Message:', err.message);
      }
      throw err;
    }
  }

  async function getLikedSongs(limit = 100) {
    let liked = [];
    let nextUrl = `https://api.spotify.com/v1/me/tracks?limit=${limit}`;
    while (nextUrl) {
      try {
        const res = await fetchWithRetry(
          (tk) => axios.get(nextUrl, { headers: { Authorization: `Bearer ${tk}` } }),
          token, refreshFn, userKey
        );
        liked = liked.concat(res.data.items.map(item => item.track));
        nextUrl = res.data.next;
      } catch (err) {
        console.error(`[ERROR] getLikedSongs: ${nextUrl}`);
        if (err.response) {
          console.error('Status:', err.response.status);
          console.error('Data:', err.response.data);
          console.error('Headers:', err.response.headers);
        } else {
          console.error('Message:', err.message);
        }
        break;
      }
    }
    return liked;
  }

  async function getSavedAlbums(limit = 50) {
    let albums = [];
    let nextUrl = `https://api.spotify.com/v1/me/albums?limit=${limit}`;
    while (nextUrl) {
      try {
        const res = await fetchWithRetry(
          (tk) => axios.get(nextUrl, { headers: { Authorization: `Bearer ${tk}` } }),
          token, refreshFn, userKey
        );
        albums = albums.concat(res.data.items.map(item => item.album));
        nextUrl = res.data.next;
      } catch (err) {
        console.error(`[ERROR] getSavedAlbums: ${nextUrl}`);
        if (err.response) {
          console.error('Status:', err.response.status);
          console.error('Data:', err.response.data);
          console.error('Headers:', err.response.headers);
        } else {
          console.error('Message:', err.message);
        }
        break;
      }
    }
    let albumTracks = [];
    for (const album of albums) {
      if (album.tracks && album.tracks.items) {
        albumTracks = albumTracks.concat(album.tracks.items);
      } else if (album.id) {
        try {
          const albumRes = await fetchWithRetry(
            (tk) => axios.get(`https://api.spotify.com/v1/albums/${album.id}/tracks`, { headers: { Authorization: `Bearer ${tk}` } }),
            token, refreshFn, userKey
          );
          albumTracks = albumTracks.concat(albumRes.data.items);
        } catch (err) {
          console.error(`[ERROR] getSavedAlbums (tracks): album ${album.name || album.id}`);
          if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', err.response.data);
            console.error('Headers:', err.response.headers);
          } else {
            console.error('Message:', err.message);
          }
        }
      }
    }
    return albumTracks.filter(t => t && typeof t === 'object' && t.id);
  }

  async function getPlaylistTracks(limit = 50) {
    let playlists = [];
    let nextUrl = `https://api.spotify.com/v1/me/playlists?limit=${limit}`;
    while (nextUrl) {
      try {
        const res = await fetchWithRetry(
          (tk) => axios.get(nextUrl, { headers: { Authorization: `Bearer ${tk}` } }),
          token, refreshFn, userKey
        );
        playlists = playlists.concat(res.data.items);
        nextUrl = res.data.next;
      } catch (err) {
        console.error(`[ERROR] getPlaylistTracks: ${nextUrl}`);
        if (err.response) {
          console.error('Status:', err.response.status);
          console.error('Data:', err.response.data);
          console.error('Headers:', err.response.headers);
        } else {
          console.error('Message:', err.message);
        }
        break;
      }
    }
    playlists = playlists.filter(p => p.public || p.collaborative);
    let playlistTracks = [];
    for (const playlist of playlists) {
      let nextTrackUrl = `https://api.spotify.com/v1/playlists/${playlist.id}/tracks?limit=100`;
      while (nextTrackUrl) {
        try {
          const trackRes = await fetchWithRetry(
            (tk) => axios.get(nextTrackUrl, { headers: { Authorization: `Bearer ${tk}` } }),
            token, refreshFn, userKey
          );
          playlistTracks = playlistTracks.concat(trackRes.data.items.map(item => item.track));
          nextTrackUrl = trackRes.data.next;
        } catch (err) {
          console.error(`[ERROR] getPlaylistTracks (tracks): playlist ${playlist.name}`);
          if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', err.response.data);
            console.error('Headers:', err.response.headers);
          } else {
            console.error('Message:', err.message);
          }
          break;
        }
      }
    }
    return playlistTracks.filter(t => t && typeof t === 'object' && t.id);
  }

  const api = new SpotifyAPI({
    clientCredentials: {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    },
    accessToken: token
  });

  // Debug: Only show api.me.top
  console.log('typeof api.me.top:', typeof api.me.top);
  try {
    console.log('Calling api.me.top for short_term tracks');
    console.log('Params:', { time_range: 'short_term', limit: 50 });
    let shortTerm;
    try {
      shortTerm = await getTop('tracks', 'short_term', 50);
    } catch (err) {
      console.error('[MAIN BLOCK ERROR] shortTerm:', err.response?.data || err.message);
      throw err;
    }
    console.log('Calling api.me.top for medium_term tracks');
    console.log('Params:', { time_range: 'medium_term', limit: 50 });
    let mediumTerm;
    try {
      mediumTerm = await getTop('tracks', 'medium_term', 50);
    } catch (err) {
      console.error('[MAIN BLOCK ERROR] mediumTerm:', err.response?.data || err.message);
      throw err;
    }
    console.log('Calling api.me.top for long_term tracks');
    console.log('Params:', { time_range: 'long_term', limit: 50 });
    let longTerm;
    try {
      longTerm = await getTop('tracks', 'long_term', 50);
    } catch (err) {
      console.error('[MAIN BLOCK ERROR] longTerm:', err.response?.data || err.message);
      throw err;
    }
    console.log('Calling api.me.recentlyPlayed');
    let recentTracks;
    try {
      recentTracks = await api.me.recentlyPlayed({ limit: 20 });
    } catch (err) {
      console.error('[MAIN BLOCK ERROR] recentlyPlayed:', err.response?.data || err.message);
      throw err;
    }
    console.log('Calling api.me.top for medium_term artists');
    console.log('Params:', { time_range: 'medium_term', limit: 20 });
    let topArtists;
    try {
      topArtists = await getTop('artists', 'medium_term', 20);
    } catch (err) {
      console.error('[MAIN BLOCK ERROR] topArtists:', err.response?.data || err.message);
      throw err;
    }
    console.log('Calling getLikedSongs');
    let likedSongs;
    try {
      likedSongs = await getLikedSongs(50);
    } catch (err) {
      console.error('[MAIN BLOCK ERROR] likedSongs:', err.response?.data || err.message);
      throw err;
    }
    console.log('Calling getSavedAlbums');
    let savedAlbumTracks;
    try {
      savedAlbumTracks = await getSavedAlbums(20);
    } catch (err) {
      console.error('[MAIN BLOCK ERROR] savedAlbumTracks:', err.response?.data || err.message);
      throw err;
    }
    console.log('Calling getPlaylistTracks');
    let playlistTracks;
    try {
      playlistTracks = await getPlaylistTracks(20);
    } catch (err) {
      console.error('[MAIN BLOCK ERROR] playlistTracks:', err.response?.data || err.message);
      throw err;
    }

    let user;
    try {
      user = await api.me.get();
    } catch (err) {
      console.error('[MAIN BLOCK ERROR] api.me.get:', err.response?.data || err.message);
      throw err;
    }

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
    console.error('[MAIN BLOCK ERROR] userData:', error.response?.data || error.message);
    throw error;
  }
}


