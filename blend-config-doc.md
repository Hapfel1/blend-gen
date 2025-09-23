# Blend Config Documentation

This file documents all available options for `blend-config.json` and the values you have used so far.

## File: blend-config.json

This file customizes how your blend playlist is generated. Place it in your project root. Example:

```json
{
  "blendStyle": "creative",
  "discoveryPercent": 20,
  "playlistLength": 50
}
```


## Options

### blendStyle
- **Type:** string
- **Description:** Controls the blend algorithm style.
- **Allowed values:**
  - `creative`: Mix of both users' favorites plus some discovery tracks (songs neither user has played, but are similar to their tastes).
  - `classic`: Only uses tracks both users have played, liked, or saved. No discovery tracks.
  - `wild`: Maximizes variety and discovery; includes more tracks outside both users' history, with higher discoveryPercent recommended.
- **Default:** `creative`

### discoveryPercent
- **Type:** number (integer, 0-100)
- **Description:** Percentage of the playlist to fill with discovery tracks (only used if blendStyle is `creative`).
- **Default:** `20`

### playlistLength
- **Type:** number (integer)
- **Description:** Total number of tracks in the generated blend playlist.
- **Default:** `50`

### sources
- **Type:** object
- **Description:** Controls which sources are included in the blend pool. Set each to `true` or `false`.
- **Keys:**
  - `shortTerm`, `mediumTerm`, `longTerm`: Top tracks from different time ranges
  - `likedSongs`: Liked songs
  - `savedAlbumTracks`: Tracks from saved albums
  - `playlistTracks`: Tracks from your playlists
  - `recentTracks`: Recently played tracks
  - `newReleaseTracks`: New releases from followed artists
  - `alwaysInclude`: Tracks from always-include.json

### weighting
- **Type:** object
- **Description:** Controls how tracks are prioritized in the blend.
- **Keys:**
  - `playCount`: If true, tracks with higher play count are prioritized
  - `recency`: If true, more recently played tracks are prioritized


### audioFeatures
- **Type:** object
- **Description:** Enables filtering tracks by audio features (see below for all possible features).
- **Keys:**
  - `enabled`: If true, audio feature matching is used
  - `match`: Array of feature names to match (see full list below)

**Possible feature names for matching:**

- `acousticness`
- `danceability`
- `energy`
- `instrumentalness`
- `liveness`
- `loudness`
- `speechiness`
- `valence`
- `tempo`
- `duration_ms`
- `key`
- `mode`
- `time_signature`

## Notes
- You can edit `blend-config.json` at any time to change how your blend is generated.
- All values are optional; defaults will be used if missing.
- The config file is ignored by git for privacy.
