"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electron", {
  login: () => electron.ipcRenderer.invoke("spotify-login"),
  youtube: {
    // FIX: Add 'region' parameter (optional)
    search: (query, region) => electron.ipcRenderer.invoke("youtube-search", query, region),
    // FIX: Add 'quality' parameter (optional)
    getStream: (videoId, quality) => electron.ipcRenderer.invoke("youtube-stream", videoId, quality)
  }
});
