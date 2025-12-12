import { SpotifyPlaylist, SpotifyTrackResponse, SpotifyPlaylistsResponse, SpotifyTrackItem } from "@/types/spotify";

const BASE_URL = "https://api.spotify.com/v1";

// Helper function to make authenticated requests to Spotify API
const spotifyFetch = async (endpoint: string, token: string) => {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Spotify API error:", error);
    throw error;
  }
};

// Get user's playlists
export const getUserPlaylists = async (
  token: string,
  offset = 0,
  limit = 50
): Promise<SpotifyPlaylistsResponse> => {
  return spotifyFetch(`/me/playlists?offset=${offset}&limit=${limit}`, token);
};

// Get a specific playlist
export const getPlaylist = async (
  token: string,
  playlistId: string
): Promise<SpotifyPlaylist> => {
  return spotifyFetch(`/playlists/${playlistId}`, token);
};

// Get tracks in a playlist
export const getPlaylistTracks = async (
  token: string,
  playlistId: string,
  offset = 0,
  limit = 50
): Promise<SpotifyTrackResponse> => {
  return spotifyFetch(`/playlists/${playlistId}/tracks?offset=${offset}&limit=${limit}`, token);
};

// Get all tracks in a playlist (handles pagination)
export const getAllPlaylistTracks = async (
  token: string,
  playlistId: string
): Promise<SpotifyTrackItem[]> => {
  const allTracks: SpotifyTrackItem[] = [];
  let offset = 0;
  const limit = 100; // Max allowed by Spotify API
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await getPlaylistTracks(token, playlistId, offset, limit);
      allTracks.push(...response.items);
      
      if (!response.next) {
        hasMore = false;
      } else {
        offset += limit;
      }
    } catch (error) {
      console.error('Error fetching playlist tracks:', error);
      hasMore = false;
    }
  }

  return allTracks;
};

// Get user's saved/liked tracks
export const getSavedTracks = async (
  token: string,
  offset = 0,
  limit = 50
): Promise<SpotifyTrackResponse> => {
  return spotifyFetch(`/me/tracks?offset=${offset}&limit=${limit}`, token);
};

// Search for tracks
export const searchTracks = async (
  token: string,
  query: string,
  offset = 0,
  limit = 20
) => {
  return spotifyFetch(
    `/search?q=${encodeURIComponent(query)}&type=track&offset=${offset}&limit=${limit}`,
    token
  );
};

export { spotifyFetch };
