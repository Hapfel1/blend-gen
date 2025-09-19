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
- **Current value:** `creative`

### discoveryPercent
- **Type:** number (integer, 0-100)
- **Description:** Percentage of the playlist to fill with discovery tracks (only used if blendStyle is `creative`).
- **Current value:** `20`

### playlistLength
- **Type:** number (integer)
- **Description:** Total number of tracks in the generated blend playlist.
- **Current value:** `50`

## Notes
- You can edit `blend-config.json` at any time to change how your blend is generated.
- All values are optional; defaults will be used if missing:
  - blendStyle: `creative`
  - discoveryPercent: `20`
  - playlistLength: `50`
- The config file is ignored by git for privacy.
