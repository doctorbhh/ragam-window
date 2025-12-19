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

declare global {
  interface Window {
    electron: {
      login: () => Promise<{ accessToken: string; accessTokenExpirationTimestampMs: number }>

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
    }
  }
}
