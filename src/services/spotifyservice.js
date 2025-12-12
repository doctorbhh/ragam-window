// Helper function to make authenticated Spotify API requests
const spotifyFetch = async (endpoint, token) => {
  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Spotify API error: ${response.status}`);
  }

  return response.json();
};

// Get user's playlists
export const getUserPlaylists = async (token, offset = 0, limit = 50) => {
  return spotifyFetch(`/me/playlists?offset=${offset}&limit=${limit}`, token);
};

// Get a specific playlist
export const getPlaylist = async (token, playlistId) => {
  return spotifyFetch(`/playlists/${playlistId}`, token);
};

// Get playlist tracks
export const getPlaylistTracks = async (token, playlistId, offset = 0, limit = 100) => {
  return spotifyFetch(`/playlists/${playlistId}/tracks?offset=${offset}&limit=${limit}`, token);
};

// Get ALL playlist tracks (handles pagination)
export const getAllPlaylistTracks = async (token, playlistId) => {
  let allTracks = [];
  let offset = 0;
  const limit = 100; // Spotify's max limit per request

  while (true) {
    const response = await getPlaylistTracks(token, playlistId, offset, limit);
    allTracks = [...allTracks, ...response.items];

    // Check if there are more tracks to fetch
    if (response.next === null || response.items.length < limit) {
      break;
    }

    offset += limit;
  }

  return allTracks;
};

// Get user's saved tracks
export const getSavedTracks = async (token, offset = 0, limit = 50) => {
  return spotifyFetch(`/me/tracks?offset=${offset}&limit=${limit}`, token);
};

// Search for tracks
export const searchTracks = async (token, query, offset = 0, limit = 20) => {
  const encodedQuery = encodeURIComponent(query);
  return spotifyFetch(`/search?q=${encodedQuery}&type=track&offset=${offset}&limit=${limit}`, token);
};


