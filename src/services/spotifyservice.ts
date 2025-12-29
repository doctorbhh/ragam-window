// spotifyservice.ts - Uses IPC handlers instead of direct API calls to avoid 429

// @ts-ignore - window.electron types
const electron = window.electron;

// Get user's playlists via IPC
export const getUserPlaylists = async (
  _token: string, // kept for compatibility but not used
  offset = 0,
  limit = 50
) => {
  try {
    return await electron.spotify.getMyPlaylists(limit, offset);
  } catch (error) {
    console.error("getUserPlaylists IPC error:", error);
    throw error;
  }
};

// Get a specific playlist via IPC
export const getPlaylist = async (
  _token: string,
  playlistId: string
) => {
  try {
    return await electron.spotify.getPlaylist(playlistId);
  } catch (error) {
    console.error("getPlaylist IPC error:", error);
    throw error;
  }
};

// Get tracks in a playlist via IPC
export const getPlaylistTracks = async (
  _token: string,
  playlistId: string,
  offset = 0,
  limit = 50
) => {
  try {
    return await electron.spotify.getPlaylistTracks(playlistId, limit, offset);
  } catch (error) {
    console.error("getPlaylistTracks IPC error:", error);
    throw error;
  }
};

// Get user's saved/liked tracks via IPC
export const getSavedTracks = async (
  _token: string,
  offset = 0,
  limit = 50
) => {
  try {
    return await electron.spotify.getSavedTracks(limit, offset);
  } catch (error) {
    console.error("getSavedTracks IPC error:", error);
    throw error;
  }
};

// Search for tracks via IPC
export const searchTracks = async (
  _token: string,
  query: string,
  offset = 0,
  limit = 20
) => {
  try {
    return await electron.spotify.searchTracks(query, limit);
  } catch (error) {
    console.error("searchTracks IPC error:", error);
    throw error;
  }
};

// Search for albums via IPC  
export const searchAlbums = async (
  _token: string,
  query: string,
  offset = 0,
  limit = 10
) => {
  try {
    // Use full search and extract albums
    const results = await electron.spotify.search(query, limit);
    return { albums: { items: results.albums || [] } };
  } catch (error) {
    console.error("searchAlbums IPC error:", error);
    throw error;
  }
};

// Get tracks in an album via IPC
export const getAlbumTracks = async (
  _token: string,
  albumId: string
) => {
  try {
    return await electron.spotify.getAlbum(albumId);
  } catch (error) {
    console.error("getAlbumTracks IPC error:", error);
    throw error;
  }
};

// Get album details via IPC
export const getAlbum = async (
  _token: string,
  albumId: string
) => {
  try {
    return await electron.spotify.getAlbum(albumId);
  } catch (error) {
    console.error("getAlbum IPC error:", error);
    throw error;
  }
};

// Get all tracks in a playlist (handles pagination)
export const getAllPlaylistTracks = async (
  _token: string,
  playlistId: string
) => {
  try {
    const allTracks: any[] = [];
    let offset = 0;
    const limit = 50;
    let hasMore = true;

    while (hasMore) {
      const response = await electron.spotify.getPlaylistTracks(playlistId, limit, offset);
      // Unwrap {track: SpotifyTrack} to just SpotifyTrack for Playlist.tsx
      // Filter out undefined/null tracks
      const unwrappedTracks = (response.items || [])
        .map((item: any) => item?.track || item)
        .filter((track: any) => track && track.id);
      allTracks.push(...unwrappedTracks);
      
      if (!response.next || response.items.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    return allTracks;
  } catch (error) {
    console.error("getAllPlaylistTracks IPC error:", error);
    throw error;
  }
};

// Get Home/Browse sections via IPC
export const getHome = async (_token: string) => {
  try {
    return await electron.spotify.getHome();
  } catch (error) {
    console.error("getHome IPC error:", error);
    throw error;
  }
};

// Legacy helper - throws error to indicate IPC should be used
export const spotifyFetch = async (_endpoint: string, _token: string) => {
  throw new Error('Direct Spotify API calls are deprecated. Use IPC handlers via window.electron.spotify instead.');
};
