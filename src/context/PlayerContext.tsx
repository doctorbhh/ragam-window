import React, { createContext, useState, useContext, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { smartSearch, searchYouTubeVideo, searchJioSaavnResults } from '@/services/youtubeService'
import { getAudioQuality } from '@/services/instanceService'
import { useSpotifyAuth } from '@/context/SpotifyAuthContext'
import { trackListening } from '@/services/firebaseRecommendations'
import { SpotifyTrack } from '@/types/spotify'
import { useDownloads } from '@/context/DownloadContext'
import { getCacheKey, getCachedAudio, cacheAudioInBackground, cancelBackgroundCaching } from '@/services/cacheService'

interface PlayerContextType {
  currentTrack: SpotifyTrack | null
  isPlaying: boolean
  queue: SpotifyTrack[]
  history: string[]
  progress: number
  duration: number
  volume: number
  isLoading: boolean
  isShuffled: boolean
  repeatMode: 'off' | 'one' | 'all'
  alternatives: any[]
  savedSourceId: string | null // The saved preferred source ID for current track
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
  changeSource: (sourceItem: any, saveAsPreferred?: boolean) => Promise<void>
  saveSourcePreference: (sourceItem: any) => Promise<void>
  clearSourcePreference: () => Promise<void>
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
  const [history, setHistory] = useState<string[]>([]) // NEW: History State
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [alternatives, setAlternatives] = useState<any[]>([])
  const [isShuffled, setIsShuffled] = useState(false)
  const [repeatMode, setRepeatMode] = useState<'off' | 'one' | 'all'>('off')
  const [savedSourceId, setSavedSourceId] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement>(new Audio())
  const preloadingIds = useRef<Set<string>>(new Set())
  const { user } = useSpotifyAuth()
  const { startDownload } = useDownloads()

  useEffect(() => {
    if (!isShuffled) {
      setOriginalQueue(queue)
    }
  }, [queue.length])

  useEffect(() => {
    const audio = audioRef.current

    const handleTimeUpdate = () => {
      setProgress(audio.currentTime)
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

  // Listen for tray playback control events
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electron?.tray) {
      window.electron.tray.onPlayPause(() => {
        if (audioRef.current.paused) {
          audioRef.current.play()
          setIsPlaying(true)
        } else {
          audioRef.current.pause()
          setIsPlaying(false)
        }
      })
      
      window.electron.tray.onNext(() => {
        const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id)
        if (currentIndex < queue.length - 1) {
          playTrack(queue[currentIndex + 1])
        }
      })
      
      window.electron.tray.onPrevious(() => {
        const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id)
        if (currentIndex > 0) {
          playTrack(queue[currentIndex - 1])
        }
      })

      return () => {
        window.electron.tray.removeAllListeners()
      }
    }
  }, [queue, currentTrack])

  const fetchStreamUrl = async (item: any) => {
    if (item.url && item.url.startsWith('http')) {
      const durationSec = item.duration_ms ? item.duration_ms / 1000 : 0
      return { url: item.url, duration: durationSec }
    }
    if (item.id) {
      const quality = getAudioQuality()
      const streamData = await window.electron.youtube.getStream(item.id, quality)
      if (streamData?.url) return streamData
    }
    throw new Error('No stream URL found')
  }

  const playTrack = async (track: SpotifyTrack) => {
    if (!track) return

    if (currentTrack?.id === track.id && audioRef.current.src) {
      togglePlayPause()
      return
    }

    audioRef.current.pause()
    setCurrentTrack(track)

    // Add to History (Max 50 items)
    setHistory((prev) => {
      const newHist = [track.id, ...prev.filter((id) => id !== track.id)].slice(0, 50)
      return newHist
    })

    setIsLoading(true)
    setAlternatives([])
    setSavedSourceId(null)

    try {
      // Use first artist for search queries
      const artistName = track.artists?.[0]?.name || ''
      // Include ALL artists in cache key for uniqueness (e.g., same song name, different language/artists)
      const allArtists = track.artists?.map((a: any) => a.name).join('_') || ''
      const cacheKey = getCacheKey(track.name, allArtists)

      // Check cache first
      const cachedUrl = await getCachedAudio(cacheKey)
      if (cachedUrl) {
        console.log('[Player] Playing from cache:', track.name)
        audioRef.current.src = cachedUrl
        audioRef.current.volume = volume
        await audioRef.current.play()
        setIsPlaying(true)
        setIsLoading(false)
        trackListeningData(track)
        return
      }

      // Check for saved preference
      const savedPref = await window.electron.songPref.get(cacheKey)
      if (savedPref && savedPref.sourceId) {
        console.log('[Player] Using saved preference:', savedPref.sourceTitle)
        setSavedSourceId(savedPref.sourceId)

        try {
          // Try to use the saved preference
          const streamData = await fetchStreamUrl({
            id: savedPref.provider === 'youtube' ? savedPref.sourceId : undefined,
            url: savedPref.provider === 'jiosaavn' ? savedPref.sourceId : undefined
          })

          if (streamData && streamData.url) {
            audioRef.current.src = streamData.url
            audioRef.current.volume = volume
            await audioRef.current.play()
            setIsPlaying(true)
            track.url = streamData.url
            trackListeningData(track)

            // Still search for alternatives in background
            smartSearch(`${track.name} ${artistName} song`).then(setAlternatives).catch(console.error)

            // Cache in background
            cacheAudioInBackground(cacheKey, streamData.url, {
              trackId: track.id,
              searchQuery: `${track.name} ${artistName}`
            })
            return
          }
        } catch (e) {
          console.warn('[Player] Saved preference failed, falling back to search:', e)
        }
      }

      // Not cached and no preference, search for audio
      const query = `${track.name} ${artistName} song`
      
      // Search YouTube Music, YouTube Video, and JioSaavn in parallel
      const [musicResults, videoResults, jioSaavnResults] = await Promise.all([
        smartSearch(query),
        searchYouTubeVideo(`${track.name} ${artistName}`),
        searchJioSaavnResults(`${track.name} ${artistName}`)
      ])
      
      // Combine results: primary music source first, then JioSaavn, then video sources
      const allResults = [
        ...musicResults,
        ...jioSaavnResults.slice(0, 5),
        ...videoResults.slice(0, 5)
      ]
      setAlternatives(allResults)

      if (allResults.length === 0) throw new Error('No results found')

      let successfulUrl = null

      for (const result of allResults) {
        try {
          const streamData = await fetchStreamUrl(result)
          if (!streamData || !streamData.url) continue
          if (streamData.duration && streamData.duration < 30) continue
          successfulUrl = streamData.url
          break
        } catch (e) {
          console.warn(`Source failed: ${result.title}`, e)
        }
      }

      if (successfulUrl) {
        track.url = successfulUrl
        audioRef.current.src = successfulUrl
        audioRef.current.volume = volume
        await audioRef.current.play()
        setIsPlaying(true)
        trackListeningData(track)

        // Cache the audio in background (non-blocking)
        cacheAudioInBackground(cacheKey, successfulUrl, {
          trackId: track.id,
          searchQuery: query
        })
      } else {
        throw new Error('All audio sources failed')
      }
    } catch (error) {
      console.error('Playback error:', error)
      toast.error(`Could not play: ${track.name}`)
      setIsLoading(false)
    }
  }

  const changeSource = async (sourceItem: any, saveAsPreferred: boolean = false) => {
    if (!currentTrack) return
    
    // Cancel any ongoing background caching (prevents wrong song from being cached)
    cancelBackgroundCaching()
    
    setIsLoading(true)
    audioRef.current.pause()
    try {
      const streamData = await fetchStreamUrl(sourceItem)
      if (streamData && streamData.url) {
        audioRef.current.src = streamData.url
        await audioRef.current.play()
        setIsPlaying(true)
        if (currentTrack) currentTrack.url = streamData.url

        // Cache the new source in background
        const allArtists = currentTrack.artists?.map((a: any) => a.name).join('_') || ''
        const cacheKey = getCacheKey(currentTrack.name, allArtists)
        cacheAudioInBackground(cacheKey, streamData.url, {
          trackId: currentTrack.id,
          searchQuery: `${currentTrack.name} ${currentTrack.artists?.[0]?.name || ''}`
        })

        // Save preference if requested
        if (saveAsPreferred) {
          await saveSourcePreference(sourceItem)
        } else {
          toast.success(`Switched to: ${sourceItem.title || sourceItem.name}`)
        }
      }
    } catch (e) {
      toast.error('Failed to play selected source')
      setIsPlaying(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Save user's preferred source for the current track
  const saveSourcePreference = async (sourceItem: any) => {
    if (!currentTrack) return
    const allArtists = currentTrack.artists?.map((a: any) => a.name).join('_') || ''
    const trackKey = getCacheKey(currentTrack.name, allArtists)

    try {
      await window.electron.songPref.set(trackKey, {
        sourceId: sourceItem.id || sourceItem.url,
        sourceTitle: sourceItem.title || sourceItem.name,
        provider: sourceItem.id ? 'youtube' : 'jiosaavn'
      })
      setSavedSourceId(sourceItem.id || sourceItem.url)
      toast.success(`Saved "${sourceItem.title || sourceItem.name}" as preferred source`)
    } catch (e) {
      console.error('Failed to save source preference:', e)
      toast.error('Failed to save preference')
    }
  }

  // Clear user's preference for the current track
  const clearSourcePreference = async () => {
    if (!currentTrack) return
    const allArtists = currentTrack.artists?.map((a: any) => a.name).join('_') || ''
    const trackKey = getCacheKey(currentTrack.name, allArtists)

    try {
      await window.electron.songPref.delete(trackKey)
      setSavedSourceId(null)
      toast.success('Preference cleared')
    } catch (e) {
      console.error('Failed to clear source preference:', e)
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
      if (repeatMode === 'all') nextIndex = 0
      else {
        setIsPlaying(false)
        return
      }
    }
    playTrack(queue[nextIndex])
  }

  const previousTrack = () => {
    if (queue.length === 0) return
    if (audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0
      return
    }
    const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id)
    let prevIndex = currentIndex - 1
    if (prevIndex < 0) {
      if (repeatMode === 'all') prevIndex = queue.length - 1
      else {
        playTrack(queue[0])
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
      const shuffled = [...queue]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
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
      if (originalQueue.length > 0) setQueue(originalQueue)
      setIsShuffled(false)
      toast.info('Shuffle Off')
    }
  }

  const toggleRepeat = () => {
    const modes: ('off' | 'all' | 'one')[] = ['off', 'all', 'one']
    const nextIndex = (modes.indexOf(repeatMode) + 1) % modes.length
    setRepeatMode(modes[nextIndex])
    toast.info(`Repeat ${modes[nextIndex]}`)
  }

  const preloadNextTrack = async () => {
    if (queue.length === 0 || repeatMode === 'one') return
    const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id)
    let nextIndex = currentIndex + 1
    if (nextIndex >= queue.length) {
      if (repeatMode === 'all') nextIndex = 0
      else return
    }
    const nextTrackToLoad = queue[nextIndex]
    if (!nextTrackToLoad || nextTrackToLoad.url || preloadingIds.current.has(nextTrackToLoad.id))
      return
    preloadingIds.current.add(nextTrackToLoad.id)
    try {
      const artistName = nextTrackToLoad.artists?.[0]?.name || ''
      const query = `${nextTrackToLoad.name} ${artistName} song`
      const results = await smartSearch(query)
      if (results.length > 0) {
        const streamData = await fetchStreamUrl(results[0])
        if (streamData && streamData.url) nextTrackToLoad.url = streamData.url
      }
    } catch (error) {
      console.error(error)
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
        history,
        isLoading,
        isShuffled,
        repeatMode,
        alternatives,
        savedSourceId,
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
        changeSource,
        saveSourcePreference,
        clearSourcePreference
      }}
    >
      {children}
    </PlayerContext.Provider>
  )
}
