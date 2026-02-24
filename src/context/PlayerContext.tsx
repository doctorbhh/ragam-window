import React, { createContext, useState, useContext, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { smartSearch, searchYouTubeVideo, searchJioSaavnResults } from '@/services/youtubeService'
import { getAudioQuality, getStoredVolume, setStoredVolume, getAudioNormalization, setAudioNormalization } from '@/services/instanceService'
import { useSpotifyAuth } from '@/context/SpotifyAuthContext'
import { trackListening } from '@/services/firebaseRecommendations'
import { SpotifyTrack } from '@/types/spotify'
import { useDownloads } from '@/context/DownloadContext'
import { getCacheKey, getCachedAudio, cacheAudioInBackground, cancelBackgroundCaching } from '@/services/cacheService'
import { getSongIdFromCache, saveSongIdToCache } from '@/services/songIdCache'

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
  // Endless Playback
  endlessPlayback: boolean
  spotifyEndless: boolean
  ytmusicEndless: boolean
  toggleSpotifyEndless: () => void
  toggleYtmusicEndless: () => void
  isNormalizationEnabled: boolean
  setNormalizationEnabled: (enabled: boolean) => void
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
  const [volume, setVolumeState] = useState(getStoredVolume())
  const [isLoading, setIsLoading] = useState(false)
  const [alternatives, setAlternatives] = useState<any[]>([])
  const [isShuffled, setIsShuffled] = useState(false)
  const [repeatMode, setRepeatMode] = useState<'off' | 'one' | 'all'>('off')
  const [savedSourceId, setSavedSourceId] = useState<string | null>(null)
  
  // Endless Playback State (separate toggles for Spotify and YT Music)
  const [spotifyEndless, setSpotifyEndless] = useState(() => {
    return localStorage.getItem('spotifyEndless') === 'true'
  })
  const [ytmusicEndless, setYtmusicEndless] = useState(() => {
    return localStorage.getItem('ytmusicEndless') === 'true'
  })
  const endlessPlayback = spotifyEndless || ytmusicEndless
  const [fetchingEndless, setFetchingEndless] = useState(false)

  // Audio Normalization State
  const [isNormalizationEnabled, setNormalizationEnabled] = useState(getAudioNormalization())

  const audioRef = useRef<HTMLAudioElement>(new Audio())
  
  // Web Audio API Contexts
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const compressorRef = useRef<DynamicsCompressorNode | null>(null)

  // Initial volume setup
  useEffect(() => {
    audioRef.current.volume = volume
    // HTML5 Audio requires CORS clearance if Web Audio node connects to it
    audioRef.current.crossOrigin = 'anonymous' 
  }, []) // Run once on mount to set initial volume

  // --- Web Audio API Initialization ---
  const initAudioContext = () => {
    if (audioContextRef.current) {
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume()
      }
      return
    }

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      audioContextRef.current = new AudioContextClass()

      // Create Nodes
      sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioRef.current)
      compressorRef.current = audioContextRef.current.createDynamicsCompressor()

      // Configure Compressor for Spotify-like Loudness Equalization
      compressorRef.current.threshold.value = -24 // Start compressing at -24dB
      compressorRef.current.knee.value = 30 // Soft knee
      compressorRef.current.ratio.value = 12 // Aggressive ratio for loud tracks
      compressorRef.current.attack.value = 0.003
      compressorRef.current.release.value = 0.25

      // Route: Source -> Compressor -> Destination
      sourceNodeRef.current.connect(compressorRef.current)
      compressorRef.current.connect(audioContextRef.current.destination)

      console.log('[Audio] Web Audio Context initialized with Compressor Node.')
    } catch (e) {
      console.error('[Audio] Failed to initialize Web Audio Context:', e)
    }
  }

  // Effect to toggle the compressor node into bypass mode when user changes setting
  useEffect(() => {
    const compressor = compressorRef.current
    if (compressor) {
      if (isNormalizationEnabled) {
        compressor.ratio.value = 12 // Re-enable aggressive ratio
        compressor.threshold.value = -24
        console.log('[Audio] Normalization ENABLED')
      } else {
        // Bypass compressor
        compressor.ratio.value = 1 
        compressor.threshold.value = 0 
        console.log('[Audio] Normalization BYPASSED')
      }
    }
  }, [isNormalizationEnabled])

  const toggleAudioNormalization = (enabled: boolean) => {
    setNormalizationEnabled(enabled)
    setAudioNormalization(enabled)
  }

  const preloadingIds = useRef<Set<string>>(new Set())
  const { user } = useSpotifyAuth()
  const { startDownload } = useDownloads()

  useEffect(() => {
    if (!isShuffled) {
      setOriginalQueue(queue)
    }
  }, [queue.length])

  // Proactive Endless Playback: Fetch when playing last track
  useEffect(() => {
    if (!endlessPlayback || !currentTrack || fetchingEndless) return
    
    const currentIndex = queue.findIndex((t) => t.id === currentTrack.id)
    
    // If queue is empty or we're on the last track, pre-fetch
    if (queue.length === 0 || currentIndex >= queue.length - 1) {
      console.log('[Endless Playback] Proactive fetch - playing last track')
      fetchRelatedTracks(currentTrack)
    }
  }, [currentTrack?.id, endlessPlayback])

  useEffect(() => {
    const audio = audioRef.current

    const handleTimeUpdate = () => {
      setProgress(audio.currentTime)
      if (audio.duration > 0 && audio.duration - audio.currentTime <= 5) {
        preloadNextTrack()
      }
      // Keep OS media overlay progress bar in sync
      if ('mediaSession' in navigator && audio.duration > 0 && Number.isFinite(audio.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: audio.currentTime
          })
        } catch (_) {}
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

  // --- Windows System Media Transport Controls (SMTC) via MediaSession API ---
  // Updates the OS media overlay with track info, artwork, and working controls
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return

    const artworkUrl = currentTrack.album?.images?.[0]?.url || ''
    const artistNames = currentTrack.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist'

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.name || 'Unknown Track',
      artist: artistNames,
      album: currentTrack.album?.name || '',
      artwork: artworkUrl ? [
        { src: artworkUrl, sizes: '96x96', type: 'image/jpeg' },
        { src: artworkUrl, sizes: '128x128', type: 'image/jpeg' },
        { src: artworkUrl, sizes: '256x256', type: 'image/jpeg' },
        { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' }
      ] : []
    })

    navigator.mediaSession.setActionHandler('play', () => {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error)
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      audioRef.current.pause()
      setIsPlaying(false)
    })
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      previousTrack()
    })
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      nextTrack()
    })
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime != null && Number.isFinite(details.seekTime)) {
        audioRef.current.currentTime = details.seekTime
        setProgress(details.seekTime)
      }
    })
  }, [currentTrack, queue])

  // Update MediaSession playback state when playing/paused
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
    }
  }, [isPlaying])

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

    // Ensure Audio Context is active (requires user gesture)
    initAudioContext()

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

      // Check if this is a direct YouTube video (track ID is a YouTube video ID - 11 chars)
      const isYouTubeVideoId = track.id && track.id.length === 11 && /^[a-zA-Z0-9_-]+$/.test(track.id)
      if (isYouTubeVideoId) {
        console.log('[Player] Direct YouTube playback:', track.id)
        try {
          const streamData = await fetchStreamUrl({ id: track.id })
          if (streamData && streamData.url) {
            audioRef.current.src = streamData.url
            audioRef.current.volume = volume
            await audioRef.current.play()
            setIsPlaying(true)
            setIsLoading(false)
            track.url = streamData.url
            trackListeningData(track)
            
            // Cache in background
            cacheAudioInBackground(cacheKey, streamData.url, {
              trackId: track.id,
              searchQuery: `${track.name} ${artistName}`
            })
            return
          }
        } catch (e) {
          console.warn('[Player] Direct YouTube playback failed, falling back to search:', e)
        }
      }

      // Check song ID cache (lightweight - skips expensive search)
      const cachedSongId = getSongIdFromCache(cacheKey)
      if (cachedSongId) {
        try {
          const streamData = await fetchStreamUrl(
            cachedSongId.provider === 'youtube'
              ? { id: cachedSongId.sourceId }
              : { url: cachedSongId.sourceId }
          )
          if (streamData && streamData.url) {
            console.log('[Player] Playing from song ID cache:', cachedSongId.title)
            audioRef.current.src = streamData.url
            audioRef.current.volume = volume
            await audioRef.current.play()
            setIsPlaying(true)
            track.url = streamData.url
            trackListeningData(track)

            // Still search for alternatives in background
            smartSearch(`${track.name} ${artistName} song`).then(setAlternatives).catch(console.error)

            cacheAudioInBackground(cacheKey, streamData.url, {
              trackId: track.id,
              searchQuery: `${track.name} ${artistName}`
            })
            return
          }
        } catch (e) {
          console.warn('[Player] Song ID cache playback failed, falling back to search:', e)
        }
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
      
      // Check if preload already resolved search results for this track
      const preloaded = (track as any)._preloadedResults
      let allResults: any[]
      
      if (preloaded && preloaded.length > 0) {
        console.log('[Player] Using preloaded search results for:', track.name)
        allResults = preloaded
        delete (track as any)._preloadedResults
      } else {
        // Search YouTube Music, YouTube Video, and JioSaavn in parallel
        const [musicResults, videoResults, jioSaavnResults] = await Promise.all([
          smartSearch(query),
          searchYouTubeVideo(`${track.name} ${artistName}`),
          searchJioSaavnResults(`${track.name} ${artistName}`)
        ])
        
        // Combine results: primary music source first, then JioSaavn, then video sources
        allResults = [
          ...musicResults,
          ...jioSaavnResults.slice(0, 5),
          ...videoResults.slice(0, 5)
        ]
      }
      setAlternatives(allResults)

      if (allResults.length === 0) throw new Error('No results found')

      let successfulUrl = null
      let winningResult: any = null

      for (const result of allResults) {
        try {
          const streamData = await fetchStreamUrl(result)
          if (!streamData || !streamData.url) continue
          if (streamData.duration && streamData.duration < 30) continue
          successfulUrl = streamData.url
          winningResult = result
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

        // Save to song ID cache for fast retrieval next time
        if (winningResult) {
          const isJioSaavn = winningResult.isJioSaavn || (winningResult.url && winningResult.url.startsWith('http'))
          const provider = isJioSaavn ? 'jiosaavn' : 'youtube'
          const sourceId = isJioSaavn ? winningResult.url : winningResult.id
          if (sourceId) {
            saveSongIdToCache(cacheKey, sourceId, provider, winningResult.title || winningResult.name || '')
          }
        }

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
      // Determine provider: JioSaavn has both id AND url, so check for JioSaavn markers first
      const isJioSaavn = sourceItem.isJioSaavn || sourceItem.url?.startsWith('http')
      const provider = isJioSaavn ? 'jiosaavn' : 'youtube'
      const sourceId = isJioSaavn ? sourceItem.url : sourceItem.id
      
      await window.electron.songPref.set(trackKey, {
        sourceId: sourceId,
        sourceTitle: sourceItem.title || sourceItem.name,
        provider: provider
      })
      setSavedSourceId(sourceId)
      toast.success(`Saved "${sourceItem.title || sourceItem.name}" as preferred source`)
      console.log('[Player] Saved preference:', { provider, sourceId, title: sourceItem.title })
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
    // Handle empty queue - trigger endless playback if enabled
    if (queue.length === 0) {
      if (endlessPlayback && currentTrack && !fetchingEndless) {
        console.log('[Endless Playback] Queue empty, fetching related tracks...')
        // Add current track to queue first so endless can continue
        setQueue([currentTrack])
        fetchRelatedTracks(currentTrack)
      }
      return
    }
    
    if (repeatMode === 'one' && currentTrack) {
      audioRef.current.currentTime = 0
      audioRef.current.play()
      return
    }
    const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id)
    let nextIndex = currentIndex + 1
    
    // Endless Playback: Fetch more tracks when near end of queue
    if (endlessPlayback && currentTrack && !fetchingEndless) {
      // Trigger fetch when on last or second-to-last track
      if (currentIndex >= queue.length - 2) {
        fetchRelatedTracks(currentTrack)
      }
    }
    
    if (nextIndex >= queue.length) {
      if (repeatMode === 'all') {
        nextIndex = 0
      } else if (endlessPlayback && fetchingEndless) {
        // Still fetching, wait a bit
        console.log('[Endless Playback] Waiting for tracks to load...')
        return
      } else if (endlessPlayback && !fetchingEndless) {
        // Fetch completed but queue didn't grow, try fetching again
        fetchRelatedTracks(currentTrack!)
        return
      } else {
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
    setStoredVolume(newVol)
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
    const nextTrackToLoad = queue[nextIndex] as any
    if (!nextTrackToLoad || nextTrackToLoad._preloadedResults || preloadingIds.current.has(nextTrackToLoad.id))
      return
    preloadingIds.current.add(nextTrackToLoad.id)
    try {
      const artistName = nextTrackToLoad.artists?.[0]?.name || ''
      const allArtistsPreload = nextTrackToLoad.artists?.map((a: any) => a.name).join('_') || ''
      const preloadCacheKey = getCacheKey(nextTrackToLoad.name, allArtistsPreload)

      // Check song ID cache first — skip search if we already know the source
      const cachedId = getSongIdFromCache(preloadCacheKey)
      if (cachedId) {
        const preloadResult = cachedId.provider === 'youtube'
          ? { id: cachedId.sourceId, title: cachedId.title }
          : { url: cachedId.sourceId, title: cachedId.title, isJioSaavn: true }
        nextTrackToLoad._preloadedResults = [preloadResult]
        console.log(`[Preload] Using song ID cache for: ${nextTrackToLoad.name}`)
        return
      }

      const query = `${nextTrackToLoad.name} ${artistName} song`
      // Only resolve search results — do NOT call fetchStreamUrl here.
      // Spawning yt-dlp while the current song streams causes audio glitches.
      const [musicResults, videoResults, jioSaavnResults] = await Promise.all([
        smartSearch(query),
        searchYouTubeVideo(`${nextTrackToLoad.name} ${artistName}`),
        searchJioSaavnResults(`${nextTrackToLoad.name} ${artistName}`)
      ])
      const allResults = [
        ...musicResults,
        ...jioSaavnResults.slice(0, 5),
        ...videoResults.slice(0, 5)
      ]
      if (allResults.length > 0) {
        nextTrackToLoad._preloadedResults = allResults
        console.log(`[Preload] Resolved ${allResults.length} sources for: ${nextTrackToLoad.name}`)
      }
    } catch (error) {
      console.error('[Preload] Search failed:', error)
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

  // Endless Playback - Fetch related tracks when queue is ending
  const fetchRelatedTracks = async (track: SpotifyTrack) => {
    if (fetchingEndless || !track) return
    
    setFetchingEndless(true)
    console.log('[Endless Playback] Fetching related tracks for:', track.name)
    
    try {
      let results: any[] = []
      
      // STRATEGY 0: YT Music Watch Playlist (Radio) — Best for YT Music tracks
      // Uses the 'next' endpoint to get YouTube Music's radio/autoplay recommendations
      const isYouTubeVideoId = track.id && track.id.length === 11 && /^[a-zA-Z0-9_-]+$/.test(track.id)
      if (ytmusicEndless && isYouTubeVideoId) {
        try {
          console.log('[Endless Playback] Trying YT Music radio for:', track.id)
          const watchResult = await window.electron.ytmusic.getWatchPlaylist(track.id, undefined, true)
          if (watchResult?.tracks && watchResult.tracks.length > 0) {
            console.log(`[Endless Playback] Got ${watchResult.tracks.length} tracks from YT Music radio`)
            results = watchResult.tracks.map((t: any) => ({
              id: t.videoId || t.id,
              title: t.title,
              artists: t.artists,
              channelTitle: t.artists?.[0]?.name || 'Unknown',
              duration: t.durationSeconds || 0,
              thumbnail: t.imageUrl || t.thumbnails?.[t.thumbnails.length - 1]?.url || ''
            }))
          }
        } catch (ytErr) {
          console.warn('[Endless Playback] YT Music radio failed:', ytErr)
        }
      }
      
      // TRY SPOTIFY: Recommendations Endpoint (Only if YT Music radio didn't return results)
      // Fallback: Artist Top Tracks (Good if recommendations fail)
      if (spotifyEndless && results.length === 0) try {
        const isSpotifyAuth = await window.electron.spotify.isAuthenticated()
        
        if (isSpotifyAuth) {
          // STRATEGY 1: Use Spotify Recommendations (Seed: Track ID)
          // Spotify IDs are 22 chars. YouTube IDs are 11 chars.
          const isValidSpotifyTrackId = track.id && track.id.length === 22 && /^[a-zA-Z0-9]+$/.test(track.id)
          
          if (isValidSpotifyTrackId) {
            console.log('[Endless Playback] Fetching Spotify Recommendations for Track:', track.id)
            try {
              const recRes = await window.electron.spotify.getRecommendations({ seed_tracks: [track.id] }, 10)
              if (recRes && recRes.length > 0) {
                console.log(`[Endless Playback] Got ${recRes.length} recommendations from Spotify`)
                // Map results
                results = recRes.map((spot: any) => ({
                  id: spot.id,
                  title: spot.name,
                  artists: spot.artists,
                  channelTitle: spot.artists?.[0]?.name || 'Unknown',
                  duration: Math.floor(spot.duration_ms / 1000),
                  thumbnail: spot.album?.images?.[0]?.url
                }))
              }
            } catch (recError) {
              console.warn('[Endless Playback] Recommendations failed, falling back to Artist Top Tracks:', recError)
            }
          }
          
          // STRATEGY 2: Artist Top Tracks (If Recommendations returned nothing or Track ID invalid)
          if (results.length === 0 && track.artists?.[0]?.name) {
            let artistId = track.artists[0].id
            const artistName = track.artists[0].name
            
            // Validate ID
            const isValidSpotifyArtistId = artistId && artistId.length === 22 && /^[a-zA-Z0-9]+$/.test(artistId)
            
            if (!isValidSpotifyArtistId) {
              console.log(`[Endless Playback] Invalid Spotify Artist ID, searching for artist: ${artistName}`)
              try {
                // Search for the artist on Spotify to get a proper ID
                const searchRes = await window.electron.spotify.searchArtists(artistName, 0, 1)
                if (searchRes?.artists?.items?.length > 0) {
                  artistId = searchRes.artists.items[0].id
                  console.log('[Endless Playback] Found valid Spotify Artist ID:', artistId)
                }
              } catch (e) {
                 console.error('[Endless Playback] Error searching artist on Spotify:', e)
              }
            }

            if (artistId && artistId.length === 22) {
              console.log('[Endless Playback] Using Spotify Artist Top Tracks for:', artistId)
              const topTracksResponse = await window.electron.spotify.getArtistTopTracks(artistId)
              
              if (topTracksResponse?.tracks && topTracksResponse.tracks.length > 0) {
                console.log(`[Endless Playback] Got ${topTracksResponse.tracks.length} top tracks from Spotify`)
                // Convert Spotify tracks to our format
                // Candidate results from Artist Top Tracks
                const candidates = topTracksResponse.tracks.map((spot: any) => ({
                  id: spot.id,
                  title: spot.name,
                  artists: spot.artists,
                  channelTitle: spot.artists?.[0]?.name || 'Unknown',
                  duration: Math.floor(spot.duration_ms / 1000),
                  thumbnail: spot.album?.images?.[0]?.url
                }))

                // Check if these candidates are already played/queued to detect "exhaustion"
                const uniqueCandidates = candidates.filter((c: any) => {
                  return !queue.some(q => q.id === c.id) && !history.includes(c.id)
                })

                if (uniqueCandidates.length > 0) {
                   results = candidates
                } else {
                   // STRATEGY 3: Related Artists Fallback (If current artist exhausted)
                   console.log('[Endless Playback] Artist exhausted (all duplicates). Trying Related Artists...')
                   try {
                     const relatedRes = await window.electron.spotify.getRelatedArtists(artistId)
                     if (relatedRes?.artists?.length > 0) {
                        // Pick a random related artist
                        const randomRelated = relatedRes.artists[Math.floor(Math.random() * Math.min(5, relatedRes.artists.length))]
                        const relatedId = randomRelated.id
                        console.log(`[Endless Playback] Switching to Related Artist: ${randomRelated.name} (${relatedId})`)
                        
                        const relatedTopTracks = await window.electron.spotify.getArtistTopTracks(relatedId)
                        if (relatedTopTracks?.tracks?.length > 0) {
                           results = relatedTopTracks.tracks.map((spot: any) => ({
                            id: spot.id,
                            title: spot.name,
                            artists: spot.artists,
                            channelTitle: spot.artists?.[0]?.name || 'Unknown',
                            duration: Math.floor(spot.duration_ms / 1000),
                            thumbnail: spot.album?.images?.[0]?.url
                          }))
                        }
                     }
                   } catch (relatedErr) {
                      console.warn('[Endless Playback] Related Artists failed:', relatedErr)
                      // Fallback to original candidates even if duplicates, better than nothing
                      results = candidates
                   }
                }
              }
            }
          }
        }
      } catch (spotifyError) {
        console.log('[Endless Playback] Spotify fetch failed, using YouTube fallback:', spotifyError)
      }
      
      // FALLBACK TO YOUTUBE if Spotify failed or no auth
      if (results.length === 0) {
        const artistName = track.artists?.[0]?.name || ''
        // Search for individual songs by artist, not mixes/compilations
        const query = artistName 
          ? `${artistName} songs Tamil` 
          : `Tamil new songs 2024`
        
        console.log('[Endless Playback] YouTube fallback search:', query)
        results = await smartSearch(query)
      }
      
      // Extract core track name (for duplicate detection)
      const coreTrackName = track.name
        .replace(/\(.*?\)/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/(remix|cover|reprise|lyrics|official|video|audio|hd|hq|full|song)/gi, '')
        .trim()
        .toLowerCase()
      
      // Words that indicate compilations/jukeboxes (not individual songs)
      const excludeKeywords = [
        'jukebox', 'mashup', 'non-stop', 'nonstop', 'non stop', 'mix', 
        'mega mix', 'megamix', 'medley', 'collection', 'all songs', 
        'best of', 'hits', 'hit songs', 'top 10', 'top 20', 'top 30', 'top 50', 'top 100',
        'back to back', 'b2b', 'audio jukebox', 'video jukebox', 'songs collection',
        'super hit', 'super hits', 'evergreen', 'playlist', 'album', 'full album',
        'full movie', 'ost', 'soundtrack', 'mass hit', 'chartbuster', 'favorites'
      ]
      
      if (results && results.length > 0) {
        // Filter and convert search results to track format
        const relatedTracks = results
          .filter((r: any) => {
            if (!r.id || !r.title) return false
            
            const resultTitleLower = r.title.toLowerCase()
            const resultCoreName = resultTitleLower
              .replace(/\(.*?\)/g, '')
              .replace(/\[.*?\]/g, '')
              .replace(/(remix|cover|reprise|lyrics|official|video|audio|hd|hq|full|song)/gi, '')
              .trim()
            
            // Exclude if title contains the original track name
            if (resultTitleLower.includes(coreTrackName) || coreTrackName.includes(resultCoreName)) {
              console.log('[Endless Playback] Skipping similar title:', r.title)
              return false
            }
            
            // Exclude jukeboxes, mashups, compilations
            if (excludeKeywords.some(keyword => resultTitleLower.includes(keyword))) {
              console.log('[Endless Playback] Skipping compilation keyword:', r.title)
              return false
            }
            
            // Exclude videos longer than 10 minutes (600 seconds)
            if (r.duration && r.duration > 600) {
              console.log('[Endless Playback] Skipping long video:', r.title, `(${Math.floor(r.duration/60)}m)`)
              return false
            }
            
            return true
          })
          .slice(0, 10)
          .map((r: any) => {
            const artistFromResult = r.artists?.[0]?.name || r.channelTitle || r.uploader || 'Unknown Artist'
            console.log(`[Endless Playback] Accepted: ${r.title} (${r.duration}s)`)
            return {
              id: r.id,
              name: r.title || 'Unknown Track',
              artists: [{ id: r.id, name: artistFromResult }],
              album: {
                id: r.id,
                name: r.title || 'Unknown Album',
                images: [{ url: r.thumbnail || `https://i.ytimg.com/vi/${r.id}/hqdefault.jpg` }],
                artists: [{ id: r.id, name: artistFromResult }]
              },
              duration_ms: (r.duration || 0) * 1000
            }
          }) as SpotifyTrack[]
        
        // Filter out duplicates: Check against BOTH queue and history (Spotube-style filtering)
        const queueIds = new Set(queue.map(t => t.id))
        const recentHistoryIds = new Set(history.slice(0, 15))
        const currentTrackId = track.id
        
        const newTracks = relatedTracks.filter(t => {
          if (t.name === 'Unknown Track') return false
          if (t.id === currentTrackId) return false
          if (queueIds.has(t.id)) {
            console.log('[Endless Playback] Skipping - already in queue:', t.name)
            return false
          }
          if (recentHistoryIds.has(t.id)) {
            console.log('[Endless Playback] Skipping - recently played:', t.name)
            return false
          }
          return true
        })
        
        if (newTracks.length > 0) {
          console.log(`[Endless Playback] Adding ${newTracks.length} related tracks to queue`)
          setQueue(prev => [...prev, ...newTracks])
          toast.success(`Added ${newTracks.length} similar tracks to queue`)
        } else {
          console.log('[Endless Playback] No new unique tracks found (all were duplicates or in history)')
        }
      }
    } catch (error) {
      console.error('[Endless Playback] Error fetching related tracks:', error)
    } finally {
      setFetchingEndless(false)
    }
  }

  const toggleSpotifyEndless = () => {
    setSpotifyEndless(prev => {
      const newValue = !prev
      localStorage.setItem('spotifyEndless', String(newValue))
      toast.success(newValue ? 'Spotify endless playback enabled' : 'Spotify endless playback disabled')
      return newValue
    })
  }

  const toggleYtmusicEndless = () => {
    setYtmusicEndless(prev => {
      const newValue = !prev
      localStorage.setItem('ytmusicEndless', String(newValue))
      toast.success(newValue ? 'YT Music endless playback enabled' : 'YT Music endless playback disabled')
      return newValue
    })
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
        clearSourcePreference,
        endlessPlayback,
        spotifyEndless,
        ytmusicEndless,
        toggleSpotifyEndless,
        toggleYtmusicEndless,
        isNormalizationEnabled,
        setNormalizationEnabled: toggleAudioNormalization
      }}
    >
      {children}
    </PlayerContext.Provider>
  )
}
