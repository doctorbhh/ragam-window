// Minimal Spotify types used by the Spotify service and auth context
export interface SpotifyImage {
  url: string;
  height?: number | null;
  width?: number | null;
}

export interface SpotifyUser {
  id: string;
  display_name: string;
  email?: string;
  images?: SpotifyImage[];
}

export interface SpotifyArtist { name: string; id?: string }

export interface SpotifyAlbum { name: string; images?: SpotifyImage[] }

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  popularity?: number;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  preview_url?: string | null;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description?: string | null;
  images?: SpotifyImage[];
  tracks: { total: number };
}

export interface SpotifyPlaylistsResponse {
  items: SpotifyPlaylist[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
  previous: string | null;
}

export interface SpotifyTrackItem { added_at?: string; track: SpotifyTrack }

export interface SpotifyTrackResponse {
  items: SpotifyTrackItem[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
  previous: string | null;
}
