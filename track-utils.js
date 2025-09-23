
export function extractGenres(artists) {
	const genres = new Set();
	artists.forEach(artist => {
		if (artist.genres) {
			artist.genres.forEach(genre => genres.add(genre));
		}
	});
	return Array.from(genres);
}

export function shuffleTracks(tracks) {
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

export function removeDuplicates(tracks) {
	const seen = new Set();
	return tracks.filter(track => {
		if (seen.has(track.id)) return false;
		seen.add(track.id);
		return true;
	});
}

