"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electron", {
  // Legacy auth (keeping for backward compatibility)
  login: () => electron.ipcRenderer.invoke("spotify-login"),
  refreshToken: (spDcCookie) => electron.ipcRenderer.invoke("spotify-refresh-token", spDcCookie),
  // --- NEW: Complete Spotify Plugin API ---
  spotify: {
    // Authentication
    login: (spDcCookie) => electron.ipcRenderer.invoke("spotify:login", spDcCookie),
    logout: () => electron.ipcRenderer.invoke("spotify:logout"),
    refreshToken: () => electron.ipcRenderer.invoke("spotify:refresh-token"),
    checkSession: () => electron.ipcRenderer.invoke("spotify:check-session"),
    getStatus: () => electron.ipcRenderer.invoke("spotify:get-status"),
    // Search
    search: (query, limit, type) => electron.ipcRenderer.invoke("spotify:search", query, limit, type),
    searchTracks: (query, limit) => electron.ipcRenderer.invoke("spotify:search-tracks", query, limit),
    // Metadata
    getTrack: (trackId) => electron.ipcRenderer.invoke("spotify:get-track", trackId),
    getTracks: (trackIds) => electron.ipcRenderer.invoke("spotify:get-tracks", trackIds),
    getAlbum: (albumId) => electron.ipcRenderer.invoke("spotify:get-album", albumId),
    getArtist: (artistId) => electron.ipcRenderer.invoke("spotify:get-artist", artistId),
    getArtistTopTracks: (artistId, market) => electron.ipcRenderer.invoke("spotify:get-artist-top-tracks", artistId, market),
    getPlaylist: (playlistId) => electron.ipcRenderer.invoke("spotify:get-playlist", playlistId),
    getLyrics: (trackId) => electron.ipcRenderer.invoke("spotify:get-lyrics", trackId),
    getRecommendations: (seeds, limit) => electron.ipcRenderer.invoke("spotify:get-recommendations", seeds, limit),
    // User
    getMe: () => electron.ipcRenderer.invoke("spotify:get-me"),
    getMyPlaylists: (limit, offset) => electron.ipcRenderer.invoke("spotify:get-my-playlists", limit, offset),
    getSavedTracks: (limit, offset) => electron.ipcRenderer.invoke("spotify:get-saved-tracks", limit, offset),
    getPlaylistTracks: (playlistId, limit, offset) => electron.ipcRenderer.invoke("spotify:get-playlist-tracks", playlistId, limit, offset),
    getRecentlyPlayed: (limit) => electron.ipcRenderer.invoke("spotify:get-recently-played", limit),
    getTopTracks: (timeRange, limit) => electron.ipcRenderer.invoke("spotify:get-top-tracks", timeRange, limit),
    getTopArtists: (timeRange, limit) => electron.ipcRenderer.invoke("spotify:get-top-artists", timeRange, limit),
    getHome: () => electron.ipcRenderer.invoke("spotify:get-home"),
    // Library
    checkSavedTracks: (trackIds) => electron.ipcRenderer.invoke("spotify:check-saved-tracks", trackIds),
    saveTracks: (trackIds) => electron.ipcRenderer.invoke("spotify:save-tracks", trackIds),
    removeTracks: (trackIds) => electron.ipcRenderer.invoke("spotify:remove-tracks", trackIds)
  },
  youtube: {
    // Music Search (YouTube Music)
    search: (query, region) => electron.ipcRenderer.invoke("youtube-search", query, region),
    // NEW: Video Search (Standard YouTube - Returns Array)
    searchVideo: (query) => electron.ipcRenderer.invoke("youtube-search-video", query),
    getStream: (videoId, quality) => electron.ipcRenderer.invoke("youtube-stream", videoId, quality),
    getVideo: (videoId) => electron.ipcRenderer.invoke("youtube-video-url", videoId)
  },
  download: {
    start: (url, filename, saveAs) => electron.ipcRenderer.invoke("download-start", { url, filename, saveAs }),
    onProgress: (callback) => electron.ipcRenderer.on("download-progress", (_, data) => callback(data)),
    onComplete: (callback) => electron.ipcRenderer.on("download-complete", (_, data) => callback(data)),
    removeAllListeners: () => {
      electron.ipcRenderer.removeAllListeners("download-progress");
      electron.ipcRenderer.removeAllListeners("download-complete");
    }
  },
  cache: {
    get: (key) => electron.ipcRenderer.invoke("cache-get", key),
    put: (key, data, metadata) => electron.ipcRenderer.invoke("cache-put", key, data, metadata),
    delete: (key) => electron.ipcRenderer.invoke("cache-delete", key),
    clear: () => electron.ipcRenderer.invoke("cache-clear"),
    getStats: () => electron.ipcRenderer.invoke("cache-stats"),
    getSettings: () => electron.ipcRenderer.invoke("cache-settings-get"),
    setSettings: (settings) => electron.ipcRenderer.invoke("cache-settings-set", settings),
    list: () => electron.ipcRenderer.invoke("cache-list")
  },
  songPref: {
    get: (trackKey) => electron.ipcRenderer.invoke("song-pref-get", trackKey),
    set: (trackKey, preference) => electron.ipcRenderer.invoke("song-pref-set", trackKey, preference),
    delete: (trackKey) => electron.ipcRenderer.invoke("song-pref-delete", trackKey),
    list: () => electron.ipcRenderer.invoke("song-pref-list"),
    clear: () => electron.ipcRenderer.invoke("song-pref-clear")
  },
  tray: {
    onPlayPause: (callback) => electron.ipcRenderer.on("tray-playpause", () => callback()),
    onNext: (callback) => electron.ipcRenderer.on("tray-next", () => callback()),
    onPrevious: (callback) => electron.ipcRenderer.on("tray-previous", () => callback()),
    removeAllListeners: () => {
      electron.ipcRenderer.removeAllListeners("tray-playpause");
      electron.ipcRenderer.removeAllListeners("tray-next");
      electron.ipcRenderer.removeAllListeners("tray-previous");
    }
  },
  plugins: {
    list: () => electron.ipcRenderer.invoke("plugins-list"),
    loadCode: (pluginId) => electron.ipcRenderer.invoke("plugins-load-code", pluginId),
    installFromUrl: (url) => electron.ipcRenderer.invoke("plugins-install-url", url),
    installFromFile: (data, filename) => electron.ipcRenderer.invoke("plugins-install-file", data, filename),
    uninstall: (pluginId) => electron.ipcRenderer.invoke("plugins-uninstall", pluginId),
    getSettings: () => electron.ipcRenderer.invoke("plugins-get-settings"),
    saveSettings: (settings) => electron.ipcRenderer.invoke("plugins-save-settings", settings)
  }
});
