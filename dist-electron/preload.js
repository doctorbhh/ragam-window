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
  }
});
