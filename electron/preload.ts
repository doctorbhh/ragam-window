import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('electron', {
  login: () => ipcRenderer.invoke('spotify-login'),

  youtube: {
    search: (query: string) => ipcRenderer.invoke('youtube-search', query),
    getStream: (videoId: string) => ipcRenderer.invoke('youtube-stream', videoId)
  }
})
