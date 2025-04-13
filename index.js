const express = require('express');
const axios = require('axios');
const cors = require('cors');
const querystring = require('querystring');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({
  origin: 'https://camerong13.sg-host.com'
}));
app.use(express.json());

let accessToken = null;

// Step 1: Redirect to Spotify login
app.get('/login', (req, res) => {
  const scope = 'playlist-modify-public playlist-modify-private';
  const redirect_uri = process.env.REDIRECT_URI;
  const client_id = process.env.SPOTIFY_CLIENT_ID;
  const authUrl = `https://accounts.spotify.com/authorize?${querystring.stringify({
    response_type: 'code',
    client_id,
    scope,
    redirect_uri,
  })}`;
  res.redirect(authUrl);
});

// Step 2: Handle callback and get access token
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const response = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.REDIRECT_URI,
    }), {
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    accessToken = response.data.access_token;
    res.redirect('https://camerong13.sg-host.com');
  } catch (err) {
    console.error(err);
    res.status(500).send("Authentication failed");
  }
});

// Step 3: Create a playlist
app.post('/create-playlist', async (req, res) => {
  const { userId, playlistName, songs } = req.body;
  try {
    const playlistResponse = await axios.post(`https://api.spotify.com/v1/users/${userId}/playlists`, {
      name: playlistName || 'My Auto Playlist',
      public: false
    }, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const playlistId = playlistResponse.data.id;
    const trackUris = [];

    for (let entry of songs) {
      const response = await axios.get(`https://api.spotify.com/v1/search`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          q: entry,
          type: 'track',
          limit: 1
        }
      });
      const track = response.data.tracks.items[0];
      if (track) trackUris.push(track.uri);
    }

    await axios.post(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      uris: trackUris
    }, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    res.json({ message: 'Playlist created successfully!', playlistId });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to create playlist');
  }
});

// Step 4: Get AI-style recommendations
app.post('/recommend', async (req, res) => {
  const { seed } = req.body;
  try {
    const response = await axios.get(`https://api.spotify.com/v1/search`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        q: seed,
        type: 'track',
        limit: 1
      }
    });

    const track = response.data.tracks.items[0];
    if (!track) return res.status(404).json({ error: 'No track found for seed input' });

    const trackId = track.id;
    const recResponse = await axios.get(`https://api.spotify.com/v1/recommendations`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        seed_tracks: trackId,
        limit: 10
      }
    });

    const recommendedSongs = recResponse.data.tracks.map(t => `${t.name} - ${t.artists[0].name}`);
    res.json({ recommendations: recommendedSongs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

// ✅ Proper Render-compatible dynamic port
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
