import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  // Legacy auth (keeping for backward compatibility)
  login: () => ipcRenderer.invoke('spotify-login'),
  refreshToken: (spDcCookie: string) => ipcRenderer.invoke('spotify-refresh-token', spDcCookie),

  // --- NEW: Complete Spotify Plugin API ---
  spotify: {
    // Authentication
    login: (spDcCookie: string) => ipcRenderer.invoke('spotify:login', spDcCookie),
    logout: () => ipcRenderer.invoke('spotify:logout'),
    refreshToken: () => ipcRenderer.invoke('spotify:refresh-token'),
    checkSession: () => ipcRenderer.invoke('spotify:check-session'),
    getStatus: () => ipcRenderer.invoke('spotify:get-status'),

    // Search
    search: (query: string, limit?: number, type?: string) => 
      ipcRenderer.invoke('spotify:search', query, limit, type),
    searchTracks: (query: string, limit?: number) => 
      ipcRenderer.invoke('spotify:search-tracks', query, limit),

    // Metadata
    getTrack: (trackId: string) => ipcRenderer.invoke('spotify:get-track', trackId),
    getTracks: (trackIds: string[]) => ipcRenderer.invoke('spotify:get-tracks', trackIds),
    getAlbum: (albumId: string) => ipcRenderer.invoke('spotify:get-album', albumId),
    getArtist: (artistId: string) => ipcRenderer.invoke('spotify:get-artist', artistId),
    getArtistTopTracks: (artistId: string, market?: string) => 
      ipcRenderer.invoke('spotify:get-artist-top-tracks', artistId, market),
    getPlaylist: (playlistId: string) => ipcRenderer.invoke('spotify:get-playlist', playlistId),
    getLyrics: (trackId: string) => ipcRenderer.invoke('spotify:get-lyrics', trackId),
    getRecommendations: (seeds: any, limit?: number) => 
      ipcRenderer.invoke('spotify:get-recommendations', seeds, limit),

    // User
    getMe: () => ipcRenderer.invoke('spotify:get-me'),
    getMyPlaylists: (limit?: number, offset?: number) => ipcRenderer.invoke('spotify:get-my-playlists', limit, offset),
    getSavedTracks: (limit?: number, offset?: number) => 
      ipcRenderer.invoke('spotify:get-saved-tracks', limit, offset),
    getPlaylistTracks: (playlistId: string, limit?: number, offset?: number) =>
      ipcRenderer.invoke('spotify:get-playlist-tracks', playlistId, limit, offset),
    getRecentlyPlayed: (limit?: number) => ipcRenderer.invoke('spotify:get-recently-played', limit),
    getTopTracks: (timeRange?: string, limit?: number) => 
      ipcRenderer.invoke('spotify:get-top-tracks', timeRange, limit),
    getTopArtists: (timeRange?: string, limit?: number) => 
      ipcRenderer.invoke('spotify:get-top-artists', timeRange, limit),
    getHome: () => ipcRenderer.invoke('spotify:get-home'),

    // Library
    checkSavedTracks: (trackIds: string[]) => ipcRenderer.invoke('spotify:check-saved-tracks', trackIds),
    saveTracks: (trackIds: string[]) => ipcRenderer.invoke('spotify:save-tracks', trackIds),
    removeTracks: (trackIds: string[]) => ipcRenderer.invoke('spotify:remove-tracks', trackIds)
  },

  youtube: {
    // Music Search (YouTube Music)
    search: (query: string, region?: string) => ipcRenderer.invoke('youtube-search', query, region),
    // NEW: Video Search (Standard YouTube - Returns Array)
    searchVideo: (query: string) => ipcRenderer.invoke('youtube-search-video', query),

    getStream: (videoId: string, quality?: string) =>
      ipcRenderer.invoke('youtube-stream', videoId, quality),
    getVideo: (videoId: string) => ipcRenderer.invoke('youtube-video-url', videoId)
  },

  download: {
    start: (url: string, filename: string, saveAs: boolean) =>
      ipcRenderer.invoke('download-start', { url, filename, saveAs }),
    onProgress: (callback: (data: any) => void) =>
      ipcRenderer.on('download-progress', (_, data) => callback(data)),
    onComplete: (callback: (data: any) => void) =>
      ipcRenderer.on('download-complete', (_, data) => callback(data)),
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('download-progress')
      ipcRenderer.removeAllListeners('download-complete')
    }
  },

  cache: {
    get: (key: string) => ipcRenderer.invoke('cache-get', key),
    put: (key: string, data: ArrayBuffer, metadata: object) =>
      ipcRenderer.invoke('cache-put', key, data, metadata),
    delete: (key: string) => ipcRenderer.invoke('cache-delete', key),
    clear: () => ipcRenderer.invoke('cache-clear'),
    getStats: () => ipcRenderer.invoke('cache-stats'),
    getSettings: () => ipcRenderer.invoke('cache-settings-get'),
    setSettings: (settings: object) => ipcRenderer.invoke('cache-settings-set', settings),
    list: () => ipcRenderer.invoke('cache-list')
  },

  songPref: {
    get: (trackKey: string) => ipcRenderer.invoke('song-pref-get', trackKey),
    set: (trackKey: string, preference: object) =>
      ipcRenderer.invoke('song-pref-set', trackKey, preference),
    delete: (trackKey: string) => ipcRenderer.invoke('song-pref-delete', trackKey),
    list: () => ipcRenderer.invoke('song-pref-list'),
    clear: () => ipcRenderer.invoke('song-pref-clear')
  },

  tray: {
    onPlayPause: (callback: () => void) =>
      ipcRenderer.on('tray-playpause', () => callback()),
    onNext: (callback: () => void) =>
      ipcRenderer.on('tray-next', () => callback()),
    onPrevious: (callback: () => void) =>
      ipcRenderer.on('tray-previous', () => callback()),
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('tray-playpause')
      ipcRenderer.removeAllListeners('tray-next')
      ipcRenderer.removeAllListeners('tray-previous')
    }
  },

  plugins: {
    list: () => ipcRenderer.invoke('plugins-list'),
    loadCode: (pluginId: string) => ipcRenderer.invoke('plugins-load-code', pluginId),
    installFromUrl: (url: string) => ipcRenderer.invoke('plugins-install-url', url),
    installFromFile: (data: ArrayBuffer, filename: string) => 
      ipcRenderer.invoke('plugins-install-file', data, filename),
    uninstall: (pluginId: string) => ipcRenderer.invoke('plugins-uninstall', pluginId),
    getSettings: () => ipcRenderer.invoke('plugins-get-settings'),
    saveSettings: (settings: object) => ipcRenderer.invoke('plugins-save-settings', settings)
  }
})

