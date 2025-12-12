"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electron", {
  login: () => electron.ipcRenderer.invoke("spotify-login"),
  youtube: {
    search: (query) => electron.ipcRenderer.invoke("youtube-search", query),
    getStream: (videoId) => electron.ipcRenderer.invoke("youtube-stream", videoId)
  }
});
