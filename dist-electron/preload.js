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
    searchTracks: (query, offset, limit) => electron.ipcRenderer.invoke("spotify:search-tracks", query, offset, limit),
    searchAlbums: (query, offset, limit) => electron.ipcRenderer.invoke("spotify:search-albums", query, offset, limit),
    searchArtists: (query, offset, limit) => electron.ipcRenderer.invoke("spotify:search-artists", query, offset, limit),
    searchPlaylists: (query, offset, limit) => electron.ipcRenderer.invoke("spotify:search-playlists", query, offset, limit),
    // Metadata
    getTrack: (trackId) => electron.ipcRenderer.invoke("spotify:get-track", trackId),
    getTracks: (trackIds) => electron.ipcRenderer.invoke("spotify:get-tracks", trackIds),
    getAlbum: (albumId) => electron.ipcRenderer.invoke("spotify:get-album", albumId),
    getArtist: (artistId) => electron.ipcRenderer.invoke("spotify:get-artist", artistId),
    getArtistTopTracks: (artistId, market) => electron.ipcRenderer.invoke("spotify:get-artist-top-tracks", artistId, market),
    getRelatedArtists: (artistId) => electron.ipcRenderer.invoke("spotify:get-related-artists", artistId),
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
    removeTracks: (trackIds) => electron.ipcRenderer.invoke("spotify:remove-tracks", trackIds),
    // Auth
    isAuthenticated: () => electron.ipcRenderer.invoke("spotify:is-authenticated"),
    getAccessToken: () => electron.ipcRenderer.invoke("spotify:get-access-token")
  },
  youtube: {
    // Music Search (YouTube Music)
    search: (query, region) => electron.ipcRenderer.invoke("youtube-search", query, region),
    // NEW: Video Search (Standard YouTube - Returns Array)
    searchVideo: (query) => electron.ipcRenderer.invoke("youtube-search-video", query),
    getStream: (videoId, quality) => electron.ipcRenderer.invoke("youtube-stream", videoId, quality),
    getVideo: (videoId) => electron.ipcRenderer.invoke("youtube-video-url", videoId),
    // NEW: Get video stream with quality selection (MPV-style bestvideo+bestaudio)
    getVideoStream: (videoId, maxHeight) => electron.ipcRenderer.invoke("youtube-video-stream", videoId, maxHeight),
    // Video download progress events
    onVideoProgress: (callback) => electron.ipcRenderer.on("video-download-progress", (_, data) => callback(data)),
    removeVideoProgressListener: () => electron.ipcRenderer.removeAllListeners("video-download-progress")
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
  lyricsPref: {
    get: (trackKey) => electron.ipcRenderer.invoke("lyrics-pref-get", trackKey),
    set: (trackKey, preference) => electron.ipcRenderer.invoke("lyrics-pref-set", trackKey, preference),
    delete: (trackKey) => electron.ipcRenderer.invoke("lyrics-pref-delete", trackKey)
  },
  savedPlaylists: {
    getAll: () => electron.ipcRenderer.invoke("saved-playlists-get"),
    add: (playlist) => electron.ipcRenderer.invoke("saved-playlists-add", playlist),
    remove: (playlistId) => electron.ipcRenderer.invoke("saved-playlists-remove", playlistId),
    check: (playlistId) => electron.ipcRenderer.invoke("saved-playlists-check", playlistId)
  },
  playlistTracks: {
    get: (playlistId) => electron.ipcRenderer.invoke("playlist-tracks-get", playlistId),
    add: (playlistId, track) => electron.ipcRenderer.invoke("playlist-tracks-add", playlistId, track),
    remove: (playlistId, trackId) => electron.ipcRenderer.invoke("playlist-tracks-remove", playlistId, trackId)
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
  ytmusic: {
    login: () => electron.ipcRenderer.invoke("ytmusic-login"),
    logout: () => electron.ipcRenderer.invoke("ytmusic:logout"),
    isAuthenticated: () => electron.ipcRenderer.invoke("ytmusic:is-authenticated"),
    getPlaylists: () => electron.ipcRenderer.invoke("ytmusic:get-playlists"),
    getPlaylist: (playlistId) => electron.ipcRenderer.invoke("ytmusic:get-playlist", playlistId),
    getHome: () => electron.ipcRenderer.invoke("ytmusic:get-home"),
    search: (query) => electron.ipcRenderer.invoke("ytmusic:search", query),
    getSong: (videoId) => electron.ipcRenderer.invoke("ytmusic:get-song", videoId),
    getWatchPlaylist: (videoId, playlistId, radio) => electron.ipcRenderer.invoke("ytmusic:get-watch-playlist", videoId, playlistId, radio),
    getSongRelated: (browseId) => electron.ipcRenderer.invoke("ytmusic:get-song-related", browseId)
  }
});
