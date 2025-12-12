import React, { createContext, useState, useContext, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { getAudioUrlForTrack } from '@/services/youtubeService'
import { useSpotifyAuth } from '@/context/SpotifyAuthContext'
import { trackListening } from '@/services/firebaseRecommendations'
import { SpotifyTrack } from '@/types/spotify'

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

  const [isShuffled, setIsShuffled] = useState(false)
  const [repeatMode, setRepeatMode] = useState<'off' | 'one' | 'all'>('off')

  // Initialize Audio object
  const audioRef = useRef<HTMLAudioElement>(new Audio())

  // Track preloading status to prevent duplicate fetches
  const preloadingIds = useRef<Set<string>>(new Set())

  const { user } = useSpotifyAuth()

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
      // Auto-skip error tracks after 2 seconds
      setTimeout(() => nextTrack(), 2000)
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

  // --- PRELOAD FUNCTION ---
  const preloadNextTrack = async () => {
    if (queue.length === 0 || repeatMode === 'one') return

    const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id)
    let nextIndex = currentIndex + 1

    // Handle end of queue
    if (nextIndex >= queue.length) {
      if (repeatMode === 'all') {
        nextIndex = 0
      } else {
        return // Nothing to preload
      }
    }

    const nextTrackToLoad = queue[nextIndex]

    // Checks: Exists? Already has URL? Already loading?
    if (!nextTrackToLoad || nextTrackToLoad.url || preloadingIds.current.has(nextTrackToLoad.id)) {
      return
    }

    console.log(`Preloading next track: ${nextTrackToLoad.name}`)
    preloadingIds.current.add(nextTrackToLoad.id)

    try {
      // Fetch the URL in the background
      const url = await getAudioUrlForTrack(nextTrackToLoad)

      // Mutate object reference in state (safe for simple caching)
      nextTrackToLoad.url = url
      console.log(`Preload complete for: ${nextTrackToLoad.name}`)
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

    try {
      let audioUrl = track.url

      // If URL is missing, fetch it
      if (!audioUrl) {
        try {
          audioUrl = await getAudioUrlForTrack(track)
          track.url = audioUrl // Cache it
        } catch (err) {
          // Fallback to Spotify 30s preview if YouTube fails
          // @ts-ignore - preview_url might be missing from type def but often exists
          if (track.preview_url) {
            // @ts-ignore
            audioUrl = track.preview_url
            toast.info('Playing preview (Full audio unavailable)')
          } else {
            throw new Error('No audio source found')
          }
        }
      }

      if (audioUrl) {
        audioRef.current.src = audioUrl
        audioRef.current.volume = volume
        await audioRef.current.play()
        setIsPlaying(true)
        trackListeningData(track)
      }
    } catch (error) {
      console.error('Playback error:', error)
      toast.error(`Could not play: ${track.name}`)
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

  const downloadTrack = async (track: SpotifyTrack) => {
    if (!track) return
    // @ts-ignore
    let downloadUrl = track.url || track.preview_url

    if (!downloadUrl) {
      try {
        toast.info('Preparing download...')
        downloadUrl = await getAudioUrlForTrack(track)
      } catch (e) {
        toast.error('Download failed')
        return
      }
    }

    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = `${track.name}.mp3`
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
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
        downloadTrack
      }}
    >
      {children}
    </PlayerContext.Provider>
  )
}
