"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electron", {
  login: () => electron.ipcRenderer.invoke("spotify-login"),
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
  }
});
