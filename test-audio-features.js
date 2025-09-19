// Minimal Spotify audio features test
// Usage: node test-audio-features.js


import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const TOKEN = process.env.USER1_TOKEN || process.env.USER2_TOKEN;
// Use a public track ID (e.g. "3n3Ppam7vgaVa1iaRUc9Lp" = Red Hot Chili Peppers - Californication)
const TRACK_IDS = ["3n3Ppam7vgaVa1iaRUc9Lp", "7ouMYWpwJ422jRcDASZB7P"];

async function testAudioFeatures() {
  if (!TOKEN) {
    console.error("No Spotify token found in environment variables.");
    return;
  }
  try {
    const url = `https://api.spotify.com/v1/audio-features?ids=${TRACK_IDS.join(",")}`;
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
      },
    });
    console.log("Audio features response:", res.data);
  } catch (err) {
    if (err.response) {
      console.error("Error response:", err.response.status, err.response.data);
    } else {
      console.error("Error:", err.message);
    }
  }
}

testAudioFeatures();
