export {}

interface CacheSettings {
  enabled: boolean
  maxSizeMB: number
}

interface CacheStats {
  count: number
  sizeBytes: number
  sizeMB: number
}

interface CachedSong {
  key: string
  trackId: string
  searchQuery: string
  cachedAt: number
  sizeMB: number
}

interface SongPreference {
  sourceId: string
  sourceTitle: string
  provider: 'youtube' | 'jiosaavn'
  savedAt: number
}

interface LyricsPreference {
  searchQuery: string
  syncedLyrics?: string
  plainLyrics?: string
  source?: string
  savedAt: number
}

interface SavedPlaylist {
  id: string
  name: string
  description?: string
  imageUrl?: string
  ownerName?: string
  trackCount?: number
  savedAt: number
}

declare global {
  interface Window {
    electron: {
      login: () => Promise<{ accessToken: string; accessTokenExpirationTimestampMs: number; spDcCookie?: string }>
      refreshToken: (spDcCookie: string) => Promise<{ success: boolean; accessToken?: string; accessTokenExpirationTimestampMs?: number; error?: string }>
      
      spotify: {
        login: (spDcCookie: string) => Promise<any>
        logout: () => Promise<void>
        isAuthenticated: () => Promise<boolean>
        refreshToken: () => Promise<any>
        checkSession: () => Promise<any>
        getStatus: () => Promise<any>
        search: (query: string, limit?: number, type?: string) => Promise<any>
        searchTracks: (query: string, offset?: number, limit?: number) => Promise<any>
        searchAlbums: (query: string, offset?: number, limit?: number) => Promise<any>
        searchArtists: (query: string, offset?: number, limit?: number) => Promise<any>
        searchPlaylists: (query: string, offset?: number, limit?: number) => Promise<any>
        getTrack: (trackId: string) => Promise<any>
        getTracks: (trackIds: string[]) => Promise<any>
        getAlbum: (albumId: string) => Promise<any>
        getArtist: (artistId: string) => Promise<any>
        getArtistTopTracks: (artistId: string, market?: string) => Promise<any>
        getRelatedArtists: (artistId: string) => Promise<{ artists: any[] }>
        getPlaylist: (playlistId: string) => Promise<any>
        getLyrics: (trackId: string) => Promise<any>
        getRecommendations: (seeds: any, limit?: number) => Promise<any>
        getMe: () => Promise<any>
        getMyPlaylists: (limit?: number, offset?: number) => Promise<any>
        getSavedTracks: (limit?: number, offset?: number) => Promise<any>
        getPlaylistTracks: (playlistId: string, limit?: number, offset?: number) => Promise<any>
        getRecentlyPlayed: (limit?: number) => Promise<any>
        getTopTracks: (timeRange?: string, limit?: number) => Promise<any>
        getTopArtists: (timeRange?: string, limit?: number) => Promise<any>
        checkSavedTracks: (trackIds: string[]) => Promise<boolean[]>
        saveTracks: (trackIds: string[]) => Promise<boolean>
        removeTracks: (trackIds: string[]) => Promise<boolean>
        getHome: () => Promise<any>
      }

      youtube: {
        search: (query: string, region?: string) => Promise<any[]>
        searchVideo: (query: string) => Promise<any[]>
        getStream: (
          videoId: string,
          quality?: string
        ) => Promise<{ url: string; duration: number; title: string } | null>
        getVideo: (
          videoId: string
        ) => Promise<{ url: string; title: string; isHls: boolean } | null>
        getVideoStream: (
          videoId: string,
          maxHeight?: number
        ) => Promise<{
          type: 'muxed' | 'dash'
          url: string
          title: string
          isHls: boolean
          height: number
          format: string
          qualities: string[]
        } | null>
        onVideoProgress: (callback: (data: any) => void) => void
        removeVideoProgressListener: () => void
      }

      download: {
        start: (
          url: string,
          filename: string,
          saveAs: boolean
        ) => Promise<{ success: boolean; error?: string }>
        onProgress: (callback: (data: any) => void) => void
        onComplete: (callback: (data: any) => void) => void
        removeAllListeners: () => void
      }

      cache: {
        get: (key: string) => Promise<ArrayBuffer | null>
        put: (key: string, data: ArrayBuffer, metadata: object) => Promise<boolean>
        delete: (key: string) => Promise<boolean>
        clear: () => Promise<boolean>
        getStats: () => Promise<CacheStats>
        getSettings: () => Promise<CacheSettings>
        setSettings: (settings: Partial<CacheSettings>) => Promise<boolean>
        list: () => Promise<CachedSong[]>
      }

      songPref: {
        get: (trackKey: string) => Promise<SongPreference | null>
        set: (trackKey: string, preference: Omit<SongPreference, 'savedAt'>) => Promise<boolean>
        delete: (trackKey: string) => Promise<boolean>
        list: () => Promise<Record<string, SongPreference>>
        clear: () => Promise<boolean>
      }

      lyricsPref: {
        get: (trackKey: string) => Promise<LyricsPreference | null>
        set: (trackKey: string, preference: Omit<LyricsPreference, 'savedAt'>) => Promise<boolean>
        delete: (trackKey: string) => Promise<boolean>
      }

      savedPlaylists: {
        getAll: () => Promise<SavedPlaylist[]>
        add: (playlist: Omit<SavedPlaylist, 'savedAt'>) => Promise<boolean>
        remove: (playlistId: string) => Promise<boolean>
        check: (playlistId: string) => Promise<boolean>
      }

      tray: {
        onPlayPause: (callback: () => void) => void
        onNext: (callback: () => void) => void
        onPrevious: (callback: () => void) => void
        removeAllListeners: () => void
      }


      ytmusic: {
        login: () => Promise<any>
        logout: () => Promise<any>
        isAuthenticated: () => Promise<boolean>
        getPlaylists: () => Promise<any>
        getPlaylist: (playlistId: string) => Promise<any>
        getHome: () => Promise<any>
        search: (query: string) => Promise<any>
        getSong: (videoId: string) => Promise<any>
        getWatchPlaylist: (videoId: string, playlistId?: string, radio?: boolean) => Promise<any>
        getSongRelated: (browseId: string) => Promise<any[]>
      }
    }
  }
}

