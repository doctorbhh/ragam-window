export interface SpotifyImage {
  url: string
  height: number
  width: number
}

export interface SpotifyArtist {
  id: string
  name: string
  images?: SpotifyImage[]
}

export interface SpotifyAlbum {
  id: string
  name: string
  images: SpotifyImage[]
  artists: SpotifyArtist[]
}

export interface SpotifyTrack {
  id: string
  name: string
  duration_ms: number
  artists: SpotifyArtist[]
  album: SpotifyAlbum
  uri?: string
  url?: string // Custom property for our app
}

// --- NEW TYPES ADDED BELOW ---

export interface SpotifyTrackItem {
  track: SpotifyTrack
  added_at: string
}

export interface SpotifyTrackResponse {
  items: SpotifyTrackItem[]
  total: number
  next: string | null
}

export interface SpotifyPlaylist {
  id: string
  name: string
  description: string
  images: SpotifyImage[]
  owner: {
    display_name: string
    id: string
  }
  tracks: {
    total: number
    items?: SpotifyTrackItem[]
  }
}

export interface SpotifyPlaylistsResponse {
  items: SpotifyPlaylist[]
  total: number
  next: string | null
}

export interface SpotifyUser {
  id: string
  display_name: string
  email: string
  images: SpotifyImage[]
}
