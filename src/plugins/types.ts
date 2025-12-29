/**
 * Plugin System Type Definitions for Ragam Music Player
 * Similar to Spotube's plugin architecture
 */

// Plugin manifest structure (plugin.json)
export interface PluginManifest {
  id: string
  name: string
  version: string
  author: string
  description: string
  type: PluginType
  entry: string
  icon?: string
  homepage?: string
  repository?: string
  abilities: PluginAbility[]
  apis: PluginAPI[]
}

export type PluginType = 'metadata' | 'auth' | 'source' | 'scrobbler' | 'lyrics'

export type PluginAbility = 
  | 'search'
  | 'getTrack'
  | 'getAlbum'
  | 'getArtist'
  | 'getPlaylist'
  | 'getUserPlaylists'
  | 'login'
  | 'logout'
  | 'getStream'
  | 'getLyrics'
  | 'scrobble'

export type PluginAPI = 
  | 'fetch'
  | 'localStorage'
  | 'webview'
  | 'notification'

// Plugin instance (loaded plugin)
export interface PluginInstance {
  manifest: PluginManifest
  enabled: boolean
  loaded: boolean
  error?: string
  exports?: PluginExports
}

// What a plugin can export
export interface PluginExports {
  // Metadata plugin methods
  search?: (query: string, options?: SearchOptions) => Promise<SearchResult>
  getTrack?: (id: string) => Promise<Track | null>
  getAlbum?: (id: string) => Promise<Album | null>
  getArtist?: (id: string) => Promise<Artist | null>
  getPlaylist?: (id: string) => Promise<Playlist | null>
  getUserPlaylists?: () => Promise<Playlist[]>
  
  // Auth plugin methods
  login?: () => Promise<AuthResult>
  logout?: () => Promise<void>
  getToken?: () => string | null
  isAuthenticated?: () => boolean
  getUser?: () => User | null
  
  // Source plugin methods (audio streaming)
  getStream?: (trackId: string, quality?: string) => Promise<StreamResult | null>
  
  // Lyrics plugin methods
  getLyrics?: (track: Track) => Promise<LyricsResult | null>
  
  // Scrobbler plugin methods
  scrobble?: (track: Track, timestamp: number) => Promise<void>
  
  // Lifecycle hooks
  onLoad?: () => Promise<void>
  onUnload?: () => Promise<void>
}

// Search options
export interface SearchOptions {
  limit?: number
  offset?: number
  type?: ('track' | 'album' | 'artist' | 'playlist')[]
}

// Search result
export interface SearchResult {
  tracks?: Track[]
  albums?: Album[]
  artists?: Artist[]
  playlists?: Playlist[]
}

// Track structure
export interface Track {
  id: string
  name: string
  duration_ms: number
  artists: Artist[]
  album?: Album
  uri?: string
  external_urls?: { [key: string]: string }
}

// Album structure
export interface Album {
  id: string
  name: string
  images: Image[]
  artists: Artist[]
  release_date?: string
  total_tracks?: number
  tracks?: { items: Track[] }
}

// Artist structure
export interface Artist {
  id: string
  name: string
  images?: Image[]
  genres?: string[]
}

// Playlist structure
export interface Playlist {
  id: string
  name: string
  description?: string
  images: Image[]
  owner?: User
  tracks: { total: number; items?: { track: Track }[] }
}

// Image structure
export interface Image {
  url: string
  width?: number
  height?: number
}

// User structure
export interface User {
  id: string
  display_name: string
  images?: Image[]
  email?: string
}

// Auth result
export interface AuthResult {
  success: boolean
  token?: string
  expiresAt?: number
  user?: User
  error?: string
}

// Stream result
export interface StreamResult {
  url: string
  duration?: number
  format?: string
  quality?: string
}

// Lyrics result
export interface LyricsResult {
  synced: boolean
  lines?: { time: number; text: string }[]
  plain?: string
}

// Plugin registry entry
export interface PluginRegistryEntry {
  id: string
  name: string
  version: string
  author: string
  description: string
  downloadUrl: string
  homepage?: string
  type: PluginType
}

// Plugin settings stored in userData
export interface PluginSettings {
  installedPlugins: { [id: string]: { enabled: boolean; settings?: any } }
  activeMetadataPlugin?: string
  activeAuthPlugin?: string
  activeSourcePlugin?: string
}
