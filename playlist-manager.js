
import axios from 'axios';

export async function createPlaylist(token, tracks, user1, user2) {
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

