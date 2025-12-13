import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  login: () => ipcRenderer.invoke('spotify-login'),

  youtube: {
    // FIX: Add 'region' parameter (optional)
    search: (query: string, region?: string) => ipcRenderer.invoke('youtube-search', query, region),
    // FIX: Add 'quality' parameter (optional)
    getStream: (videoId: string, quality?: string) =>
      ipcRenderer.invoke('youtube-stream', videoId, quality)
  }
})
