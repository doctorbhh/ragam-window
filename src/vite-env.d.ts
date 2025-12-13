/// <reference types="vite/client" />

interface Window {
  electron: {
    youtube: {
      search: (query: string, region?: string) => Promise<any[]>
      getStream: (
        videoId: string,
        quality?: string
      ) => Promise<{ url: string; duration: number } | null>
    }
    spotify: {
      login: () => Promise<any>
    }
  }
}
