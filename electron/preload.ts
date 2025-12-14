import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  login: () => ipcRenderer.invoke('spotify-login'),

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
  }
})
