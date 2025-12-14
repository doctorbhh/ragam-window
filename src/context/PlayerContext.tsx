import React, { createContext, useState, useContext, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { smartSearch } from '@/services/youtubeService'
import { getAudioQuality } from '@/services/instanceService'
import { useSpotifyAuth } from '@/context/SpotifyAuthContext'
import { trackListening } from '@/services/firebaseRecommendations'
import { SpotifyTrack } from '@/types/spotify'
import { useDownloads } from '@/context/DownloadContext' // Ensure this exists

// Define the shape of the Context
interface PlayerContextType {
  currentTrack: SpotifyTrack | null
  isPlaying: boolean
  queue: SpotifyTrack[]
  progress: number
  duration: number
  volume: number
  isLoading: boolean
  isShuffled: boolean
  repeatMode: 'off' | 'one' | 'all'
  // NEW: Search results for the current track
  alternatives: any[]
  playTrack: (track: SpotifyTrack) => Promise<void>
  togglePlayPause: () => void
  nextTrack: () => void
  previousTrack: () => void
  seekTo: (time: number) => void
  setVolume: (val: number) => void
  addToQueue: (track: SpotifyTrack) => void
  addManyToQueue: (tracks: SpotifyTrack[]) => void
  clearQueue: () => void
  toggleShuffle: () => void
  toggleRepeat: () => void
  downloadTrack: (track: SpotifyTrack) => Promise<void>
  // NEW: Function to manually swap audio source
  changeSource: (sourceItem: any) => Promise<void>
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined)

export const usePlayer = () => {
  const context = useContext(PlayerContext)
  if (context === undefined) {
    throw new Error('usePlayer must be used within a PlayerProvider')
  }
  return context
}

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState<SpotifyTrack | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [queue, setQueue] = useState<SpotifyTrack[]>([])
  const [originalQueue, setOriginalQueue] = useState<SpotifyTrack[]>([])
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(1)
  const [isLoading, setIsLoading] = useState(false)

  // NEW: Store alternative audio sources found for the current song
  const [alternatives, setAlternatives] = useState<any[]>([])

  const [isShuffled, setIsShuffled] = useState(false)
  const [repeatMode, setRepeatMode] = useState<'off' | 'one' | 'all'>('off')

  // Initialize Audio object
  const audioRef = useRef<HTMLAudioElement>(new Audio())

  // Track preloading status to prevent duplicate fetches
  const preloadingIds = useRef<Set<string>>(new Set())

  const { user } = useSpotifyAuth()

  // FIX: Get the download function from the Download Context
  // Note: PlayerProvider MUST be wrapped inside DownloadProvider in App.tsx for this to work
  const { startDownload } = useDownloads()

  // Keep originalQueue in sync when songs are added (if not shuffled)
  useEffect(() => {
    if (!isShuffled) {
      setOriginalQueue(queue)
    }
  }, [queue.length])

  // Main Audio Event Listeners & Logic
  useEffect(() => {
    const audio = audioRef.current

    const handleTimeUpdate = () => {
      setProgress(audio.currentTime)

      // --- PRELOAD LOGIC ---
      // If less than 5 seconds remaining, load the next song
      if (audio.duration > 0 && audio.duration - audio.currentTime <= 5) {
        preloadNextTrack()
      }
    }

    const handleDurationChange = () => setDuration(audio.duration)
    const handleEnded = () => nextTrack()
    const handleLoadStart = () => setIsLoading(true)
    const handleCanPlay = () => setIsLoading(false)
    const handleError = (e: Event) => {
      console.error('Audio error:', e)
      setIsLoading(false)
      // Auto-skip error tracks after 1 second
      setTimeout(() => nextTrack(), 1000)
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('canplay', handleCanPlay)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('canplay', handleCanPlay)
      audio.removeEventListener('error', handleError)
    }
  }, [queue, currentTrack, repeatMode])

  // Helper: Fetch actual stream URL from a search result item
  const fetchStreamUrl = async (item: any) => {
    // If it's JioSaavn or already has a direct URL
    if (item.url && item.url.startsWith('http')) {
      // For JioSaavn, duration is usually in ms
      const durationSec = item.duration_ms ? item.duration_ms / 1000 : 0
      return { url: item.url, duration: durationSec }
    }

    // If it's YouTube, we need to extract the stream using the backend
    if (item.id) {
      const quality = getAudioQuality()
      const streamData = await window.electron.youtube.getStream(item.id, quality)
      if (streamData?.url) return streamData
    }
    throw new Error('No stream URL found')
  }

  const playTrack = async (track: SpotifyTrack) => {
    if (!track) return

    // If clicking same track, just toggle
    if (currentTrack?.id === track.id && audioRef.current.src) {
      togglePlayPause()
      return
    }

    audioRef.current.pause()
    setCurrentTrack(track)
    setIsLoading(true)
    setAlternatives([]) // Reset alternatives for new track

    try {
      // 1. Search for potential audio sources (Alternatives)
      const artistName = track.artists?.[0]?.name || ''
      const query = `${track.name} ${artistName} song`

      console.log('Searching sources for:', query)
      const results = await smartSearch(query)
      setAlternatives(results)

      if (results.length === 0) {
        throw new Error('No results found')
      }

      // 2. INTELLIGENT FALLBACK LOOP
      let successfulUrl = null

      // Iterate through results until one works
      for (const result of results) {
        try {
          console.log(`Trying source: ${result.title || result.name} (${result.id})`)
          const streamData = await fetchStreamUrl(result)

          // CHECK 1: Is the URL valid?
          if (!streamData || !streamData.url) continue

          // CHECK 2: Is it a "Short" version / Preview? (Less than 45 seconds)
          // Most full songs are > 2 mins. This filters out 30s previews/shorts.
          if (streamData.duration && streamData.duration < 30) {
            console.warn(`Skipping short version (${streamData.duration}s): ${result.title}`)
            continue
          }

          // If we passed checks, use this source!
          successfulUrl = streamData.url
          break // Exit loop, we found a song
        } catch (e) {
          console.warn(`Source failed: ${result.title}`, e)
          // Continue to next result...
        }
      }

      if (successfulUrl) {
        track.url = successfulUrl // Cache valid URL
        audioRef.current.src = successfulUrl
        audioRef.current.volume = volume
        await audioRef.current.play()
        setIsPlaying(true)
        trackListeningData(track)
      } else {
        // All sources failed
        throw new Error('All audio sources failed or were too short')
      }
    } catch (error) {
      console.error('Playback error:', error)
      toast.error(`Could not play: ${track.name}`)
      setIsLoading(false)
      // Auto-skip logic is handled by the 'error' event listener in useEffect
    }
  }

  // NEW: Manual Source Switching
  const changeSource = async (sourceItem: any) => {
    if (!currentTrack) return

    setIsLoading(true)
    audioRef.current.pause()

    try {
      const streamData = await fetchStreamUrl(sourceItem)
      if (streamData && streamData.url) {
        audioRef.current.src = streamData.url
        await audioRef.current.play()
        setIsPlaying(true)

        // Update current track info to match new source URL
        if (currentTrack) {
          currentTrack.url = streamData.url
        }
        toast.success(`Switched to: ${sourceItem.title || sourceItem.name}`)
      }
    } catch (e) {
      toast.error('Failed to play selected source')
      setIsPlaying(false)
    } finally {
      setIsLoading(false)
    }
  }

  const togglePlayPause = () => {
    if (audioRef.current.paused) {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(console.error)
    } else {
      audioRef.current.pause()
      setIsPlaying(false)
    }
  }

  const nextTrack = () => {
    if (queue.length === 0) return

    if (repeatMode === 'one' && currentTrack) {
      audioRef.current.currentTime = 0
      audioRef.current.play()
      return
    }

    const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id)
    let nextIndex = currentIndex + 1

    if (nextIndex >= queue.length) {
      if (repeatMode === 'all') {
        nextIndex = 0
      } else {
        setIsPlaying(false)
        return
      }
    }

    playTrack(queue[nextIndex])
  }

  const previousTrack = () => {
    if (queue.length === 0) return

    // If played more than 3 sec, restart song
    if (audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0
      return
    }

    const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id)
    let prevIndex = currentIndex - 1

    if (prevIndex < 0) {
      if (repeatMode === 'all') {
        prevIndex = queue.length - 1
      } else {
        playTrack(queue[0]) // Go to start of queue
        return
      }
    }

    playTrack(queue[prevIndex])
  }

  const seekTo = (time: number) => {
    if (Number.isFinite(time)) {
      audioRef.current.currentTime = time
      setProgress(time)
    }
  }

  const addToQueue = (track: SpotifyTrack) => {
    setQueue((prev) => [...prev, track])
    if (!isShuffled) setOriginalQueue((prev) => [...prev, track])
    toast.success('Added to queue')
  }

  const addManyToQueue = (tracks: SpotifyTrack[]) => {
    if (!tracks?.length) return
    setQueue((prev) => [...prev, ...tracks])
    if (!isShuffled) setOriginalQueue((prev) => [...prev, ...tracks])
  }

  const setPlayerVolume = (val: number) => {
    const newVol = Math.max(0, Math.min(1, val))
    setVolumeState(newVol)
    if (audioRef.current) audioRef.current.volume = newVol
  }

  const toggleShuffle = () => {
    if (!isShuffled) {
      // Create shuffled copy
      const shuffled = [...queue]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }

      // Ensure current track is first
      if (currentTrack) {
        const currentIdx = shuffled.findIndex((t) => t.id === currentTrack.id)
        if (currentIdx > -1) {
          shuffled.splice(currentIdx, 1)
          shuffled.unshift(currentTrack)
        }
      }
      setQueue(shuffled)
      setIsShuffled(true)
      toast.info('Shuffle On')
    } else {
      // Restore original
      if (originalQueue.length > 0) {
        setQueue(originalQueue)
      }
      setIsShuffled(false)
      toast.info('Shuffle Off')
    }
  }

  const toggleRepeat = () => {
    const modes: ('off' | 'all' | 'one')[] = ['off', 'all', 'one']
    const nextIndex = (modes.indexOf(repeatMode) + 1) % modes.length
    const newMode = modes[nextIndex]
    setRepeatMode(newMode)

    const messages = {
      off: 'Repeat Off',
      all: 'Repeat Queue',
      one: 'Repeat Track'
    }
    toast.info(messages[newMode])
  }

  // --- PRELOAD FUNCTION ---
  const preloadNextTrack = async () => {
    if (queue.length === 0 || repeatMode === 'one') return

    const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id)
    let nextIndex = currentIndex + 1

    if (nextIndex >= queue.length) {
      if (repeatMode === 'all') nextIndex = 0
      else return
    }

    const nextTrackToLoad = queue[nextIndex]

    if (!nextTrackToLoad || nextTrackToLoad.url || preloadingIds.current.has(nextTrackToLoad.id)) {
      return
    }

    console.log(`Preloading next track: ${nextTrackToLoad.name}`)
    preloadingIds.current.add(nextTrackToLoad.id)

    try {
      const artistName = nextTrackToLoad.artists?.[0]?.name || ''
      const query = `${nextTrackToLoad.name} ${artistName} song`
      const results = await smartSearch(query)

      if (results.length > 0) {
        const streamData = await fetchStreamUrl(results[0])
        if (streamData && streamData.url) {
          nextTrackToLoad.url = streamData.url
          console.log(`Preload complete for: ${nextTrackToLoad.name}`)
        }
      }
    } catch (error) {
      console.error(`Failed to preload ${nextTrackToLoad.name}:`, error)
    } finally {
      preloadingIds.current.delete(nextTrackToLoad.id)
    }
  }

  const trackListeningData = async (track: SpotifyTrack) => {
    if (!user) return
    try {
      await trackListening(user.id, track)
    } catch (e) {
      console.error(e)
    }
  }

  // FIX: Updated to use the Download Context
  const downloadTrack = async (track: SpotifyTrack) => {
    if (!track) return
    await startDownload(track)
  }

  const clearQueue = () => {
    setQueue([])
    setOriginalQueue([])
  }

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        progress,
        duration,
        volume,
        queue,
        isLoading,
        isShuffled,
        repeatMode,
        alternatives,
        playTrack,
        togglePlayPause,
        nextTrack,
        previousTrack,
        seekTo,
        setVolume: setPlayerVolume,
        addToQueue,
        addManyToQueue,
        clearQueue,
        toggleShuffle,
        toggleRepeat,
        downloadTrack,
        changeSource
      }}
    >
      {children}
    </PlayerContext.Provider>
  )
}
