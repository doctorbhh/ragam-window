import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { toast } from 'sonner'
import { SpotifyTrack } from '@/types/spotify'
import { getAudioUrlForTrack } from '@/services/youtubeService'

export interface DownloadItem {
  id: string // track ID or unique ID
  trackName: string
  artistName: string
  image?: string
  progress: number // 0 to 100
  status: 'pending' | 'downloading' | 'completed' | 'error' | 'cancelled'
  filePath?: string
  url: string // Used to match events
}

interface DownloadContextType {
  downloads: DownloadItem[]
  startDownload: (track: SpotifyTrack, askLocation?: boolean) => Promise<void>
  clearDownloads: () => void
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined)

export const useDownloads = () => {
  const context = useContext(DownloadContext)
  if (!context) throw new Error('useDownloads must be used within DownloadProvider')
  return context
}

export const DownloadProvider = ({ children }: { children: ReactNode }) => {
  const [downloads, setDownloads] = useState<DownloadItem[]>([])

  // Setup Listeners
  useEffect(() => {
    // Progress Listener
    // @ts-ignore
    window.electron.download.onProgress((data) => {
      setDownloads((prev) =>
        prev.map((item) => {
          if (item.url === data.url) {
            return { ...item, progress: Math.round(data.progress * 100), status: 'downloading' }
          }
          return item
        })
      )
    })

    // Complete Listener
    // @ts-ignore
    window.electron.download.onComplete((data) => {
      setDownloads((prev) =>
        prev.map((item) => {
          if (item.url === data.url) {
            const status = data.state === 'completed' ? 'completed' : 'error'
            if (status === 'completed') toast.success(`Downloaded: ${item.trackName}`)
            else toast.error(`Download failed: ${item.trackName}`)

            return {
              ...item,
              progress: 100,
              status: status,
              filePath: data.path
            }
          }
          return item
        })
      )
    })

    return () => {
      // @ts-ignore
      window.electron.download.removeAllListeners()
    }
  }, [])

  const startDownload = async (track: SpotifyTrack, askLocation = false) => {
    // Check if already downloading
    if (downloads.find((d) => d.id === track.id && d.status === 'downloading')) {
      toast.warning('Already downloading this track')
      return
    }

    const toastId = toast.loading(`Preparing: ${track.name}...`)

    try {
      // 1. Get URL (resolve if needed)
      // @ts-ignore
      let url = track.url
      if (!url) {
        url = await getAudioUrlForTrack(track)
      }

      // 2. Add to list as pending
      const newItem: DownloadItem = {
        id: track.id,
        trackName: track.name,
        artistName: track.artists?.[0]?.name || 'Unknown',
        image: track.album?.images?.[0]?.url,
        progress: 0,
        status: 'pending',
        url: url
      }

      setDownloads((prev) => [newItem, ...prev])

      // 3. Trigger Electron Download
      const filename = `${track.name} - ${track.artists?.[0]?.name}.mp3`.replace(
        /[^a-z0-9 \.\-_]/gi,
        ''
      ) // Sanitize
      // @ts-ignore
      await window.electron.download.start(url, filename, askLocation)

      toast.dismiss(toastId)
      toast.info('Download started')
    } catch (e) {
      console.error(e)
      toast.dismiss(toastId)
      toast.error('Failed to get download URL')
      setDownloads((prev) => prev.filter((d) => d.id !== track.id)) // Remove failed
    }
  }

  const clearDownloads = () => {
    setDownloads([])
  }

  return (
    <DownloadContext.Provider value={{ downloads, startDownload, clearDownloads }}>
      {children}
    </DownloadContext.Provider>
  )
}
