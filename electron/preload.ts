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
  }
})
