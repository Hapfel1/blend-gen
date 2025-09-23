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
    const res = await fetchWithRetry(
      (tk) => axios.get(url, { headers: { Authorization: `Bearer ${tk}` } }),
      token, refreshFn, userKey
    );
    return res.data;
  }

  async function getLikedSongs(limit = 100) {
    let liked = [];
    let nextUrl = `https://api.spotify.com/v1/me/tracks?limit=${limit}`;
    while (nextUrl) {
      const res = await fetchWithRetry(
        (tk) => axios.get(nextUrl, { headers: { Authorization: `Bearer ${tk}` } }),
        token, refreshFn, userKey
      );
      liked = liked.concat(res.data.items.map(item => item.track));
      nextUrl = res.data.next;
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
        console.error('Failed to fetch saved albums:', err.response?.data || err.message);
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
          console.error(`Failed to fetch tracks for album ${album.name || album.id}:`, err.response?.data || err.message);
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
        console.error('Failed to fetch playlists:', err.response?.data || err.message);
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
          console.error(`Failed to fetch tracks for playlist ${playlist.name}:`, err.response?.data || err.message);
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


