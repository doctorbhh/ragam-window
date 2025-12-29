import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Repeat1,
  Shuffle,
  Volume2,
  VolumeX,
  Mic2,
  ListMusic,
  Heart,
  Loader2,
  Download,
  MonitorPlay,
  X,
  ListVideo,
  Settings,
  Star,
  Check
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { usePlayer } from '@/context/PlayerContext'
import Hls from 'hls.js'

// --- HLS VIDEO PLAYER COMPONENT ---
interface VideoModalProps {
  trackName: string
  artistName: string
  onClose: () => void
}

const VideoModal = ({ trackName, artistName, onClose }: VideoModalProps) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null) // Use ref to avoid stale closure
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Video State
  const [videoAlternatives, setVideoAlternatives] = useState<any[]>([])
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null)

  // HLS State
  const [levels, setLevels] = useState<any[]>([])
  const [currentLevel, setCurrentLevel] = useState(-1) // -1 = Auto

  // Cleanup function - runs when modal closes
  useEffect(() => {
    return () => {
      console.log('[VideoModal] Cleanup - stopping video and HLS')
      // Stop video playback
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.src = ''
        videoRef.current.load()
      }
      // Destroy HLS instance to stop streaming
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [])

  // Initial Search (Finds top 5 videos)
  useEffect(() => {
    const searchAndPlay = async () => {
      setLoading(true)
      try {
        const query = `${trackName} ${artistName} official music video`

        // @ts-ignore
        const results = await window.electron.youtube.searchVideo(query)

        if (!results || results.length === 0) {
          throw new Error('No videos found')
        }

        setVideoAlternatives(results)
        // Automatically play the first result
        loadVideoStream(results[0].id)
      } catch (err) {
        console.error('Search Error:', err)
        setError('Could not find video.')
        setLoading(false)
      }
    }
    searchAndPlay()
  }, [trackName, artistName])

  // 2. Load Specific Stream (Helper Function)
  const loadVideoStream = async (videoId: string) => {
    // Cleanup previous HLS if exists
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    setLevels([])
    setLoading(true)
    setCurrentVideoId(videoId)

    try {
      // @ts-ignore
      const streamData = await window.electron.youtube.getVideo(videoId)

      if (!streamData || !streamData.url) throw new Error('Stream extraction failed')

      const video = videoRef.current
      if (!video) return

      if (streamData.isHls) {
        if (Hls.isSupported()) {
          const hls = new Hls()
          hls.loadSource(streamData.url)
          hls.attachMedia(video)

          hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
            setLevels(data.levels)
            hlsRef.current = hls
            video.play().catch((e) => console.error('Autoplay blocked', e))
          })
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = streamData.url
          video.addEventListener('loadedmetadata', () => video.play())
        }
      } else {
        video.src = streamData.url
        video.play()
      }
      setError(null)
    } catch (err) {
      console.error('Stream Error:', err)
      setError('Unable to load video stream.')
    } finally {
      setLoading(false)
    }
  }

  const changeQuality = (levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex
      setCurrentLevel(levelIndex)
    }
  }

  const formatDuration = (sec: number) => {
    if (!sec) return ''
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return createPortal(
    <div
      className="fixed inset-0 w-screen h-screen bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center animate-in fade-in duration-300"
      style={{ zIndex: 2147483647 }}
    >
      {/* CONTROLS OVERLAY */}
      <div className="absolute top-6 right-6 z-50 flex items-center gap-4">
        {/* --- VIDEO SOURCE SELECTOR (TOP 5) --- */}
        {videoAlternatives.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded-full p-3 transition-all backdrop-blur-md hover:scale-105"
                title="Switch Video Version"
              >
                <ListVideo size={22} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 p-0 bg-black/80 border-white/10 text-white backdrop-blur-xl shadow-2xl rounded-xl mr-4"
              align="end"
              style={{ zIndex: 2147483650 }}
            >
              <div className="p-3 border-b border-white/10 bg-white/5">
                <h4 className="font-semibold text-sm text-white">Video Sources</h4>
              </div>
              <div className="max-h-80 overflow-y-auto custom-scrollbar p-1">
                {videoAlternatives.map((video) => (
                  <button
                    key={video.id}
                    onClick={() => loadVideoStream(video.id)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left group ${currentVideoId === video.id ? 'bg-primary/20 border border-primary/30' : 'hover:bg-white/10'}`}
                  >
                    <div className="h-12 w-20 shrink-0 overflow-hidden rounded-md bg-black relative">
                      <img
                        src={video.thumbnail}
                        className="h-full w-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-medium truncate ${currentVideoId === video.id ? 'text-primary' : 'text-white/90'}`}
                      >
                        {video.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {video.channel} • {formatDuration(video.duration)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* QUALITY SELECTOR */}
        {levels.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded-full p-3 transition-all backdrop-blur-md hover:scale-105"
                title="Quality"
              >
                <Settings size={22} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-40 p-1 bg-black/80 border-white/10 text-white backdrop-blur-xl shadow-2xl rounded-xl"
              align="end"
              style={{ zIndex: 2147483650 }}
            >
              <div className="flex flex-col max-h-64 overflow-y-auto custom-scrollbar">
                <button
                  onClick={() => changeQuality(-1)}
                  className={`text-left px-3 py-2 text-sm rounded-lg hover:bg-white/10 transition-colors ${currentLevel === -1 ? 'text-primary font-bold bg-white/5' : ''}`}
                >
                  Auto
                </button>
                {levels
                  .map((level, index) => (
                    <button
                      key={index}
                      onClick={() => changeQuality(index)}
                      className={`text-left px-3 py-2 text-sm rounded-lg hover:bg-white/10 transition-colors ${currentLevel === index ? 'text-primary font-bold bg-white/5' : ''}`}
                    >
                      {level.height}p
                    </button>
                  ))
                  .reverse()}
              </div>
            </PopoverContent>
          </Popover>
        )}

        <button
          onClick={onClose}
          className="bg-white/10 hover:bg-red-500/20 hover:text-red-500 text-white border border-white/10 rounded-full p-3 transition-all backdrop-blur-md hover:scale-105"
        >
          <X size={22} />
        </button>
      </div>

      <div className="w-full h-full flex items-center justify-center relative p-4 sm:p-10">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-4 z-10">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
            <p className="text-xl font-light tracking-[0.2em] uppercase opacity-70 animate-pulse">
              Loading Stream
            </p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 gap-6 z-10">
            <MonitorPlay size={80} className="opacity-20" />
            <p className="text-2xl font-medium text-white">{error}</p>
            <Button onClick={onClose} variant="secondary" className="rounded-full px-8">
              Close Player
            </Button>
          </div>
        )}

        <video
          ref={videoRef}
          className="w-full h-full max-h-[85vh] object-contain rounded-xl shadow-2xl shadow-black/50"
          controls
          autoPlay
          controlsList="nodownload"
        />
      </div>
    </div>,
    document.body
  )
}

// --- MAIN PLAYER COMPONENT ---
export function Player() {
  const {
    currentTrack,
    isPlaying,
    progress,
    duration,
    volume,
    isLoading,
    togglePlayPause,
    seekTo,
    setVolume: setPlayerVolume,
    nextTrack,
    previousTrack,
    queue,
    playTrack,
    isShuffled,
    repeatMode,
    toggleShuffle,
    toggleRepeat,
    downloadTrack,
    alternatives,
    changeSource,
    savedSourceId,
    saveSourcePreference,
    clearSourcePreference,
    clearQueue
  } = usePlayer()

  const [isLiked, setIsLiked] = useState(false)
  const [localProgress, setLocalProgress] = useState([0])
  const [localVolume, setLocalVolume] = useState([volume * 100])
  const [isVideoOpen, setIsVideoOpen] = useState(false)

  // --- KEYBOARD SHORTCUTS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        return

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          togglePlayPause()
          break
        case 'ArrowUp':
          e.preventDefault()
          setPlayerVolume(Math.min(1, volume + 0.1))
          break
        case 'ArrowDown':
          e.preventDefault()
          setPlayerVolume(Math.max(0, volume - 0.1))
          break
        case 'ArrowLeft':
          previousTrack()
          break
        case 'ArrowRight':
          nextTrack()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlayPause, volume, setPlayerVolume, previousTrack, nextTrack])

  // --- LYRICS STATE ---
  interface LyricLine {
    time: number
    text: string
  }
  const [syncedLyrics, setSyncedLyrics] = useState<LyricLine[]>([])
  const [plainLyrics, setPlainLyrics] = useState('')
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1)
  const [loadingLyrics, setLoadingLyrics] = useState(false)
  const activeLyricRef = useRef<HTMLParagraphElement>(null)
  const lyricsContainerRef = useRef<HTMLDivElement>(null)
  
  // Album colors for gradient and text
  const [albumColor, setAlbumColor] = useState('rgb(20, 20, 20)')
  const [lyricAccentColor, setLyricAccentColor] = useState('rgb(255, 255, 255)')
  
  // Extract dominant color from album art
  useEffect(() => {
    if (!currentTrack?.album?.images?.[0]?.url) {
      setAlbumColor('rgb(20, 20, 20)')
      setLyricAccentColor('rgb(255, 255, 255)')
      return
    }
    
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.src = currentTrack.album.images[0].url
    
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      
      canvas.width = 50 // Small size for performance
      canvas.height = 50
      ctx.drawImage(img, 0, 0, 50, 50)
      
      try {
        const imageData = ctx.getImageData(0, 0, 50, 50).data
        let r = 0, g = 0, b = 0, count = 0
        
        // Sample pixels (skip some for performance)
        for (let i = 0; i < imageData.length; i += 16) {
          r += imageData[i]
          g += imageData[i + 1]
          b += imageData[i + 2]
          count++
        }
        
        r = Math.floor(r / count)
        g = Math.floor(g / count)
        b = Math.floor(b / count)
        
        // Bright version for active lyric text (boost saturation and brightness)
        const brightR = Math.min(255, Math.floor(r * 1.5 + 80))
        const brightG = Math.min(255, Math.floor(g * 1.5 + 80))
        const brightB = Math.min(255, Math.floor(b * 1.5 + 80))
        setLyricAccentColor(`rgb(${brightR}, ${brightG}, ${brightB})`)
        
        // Darken the color for better text readability
        r = Math.floor(r * 0.4)
        g = Math.floor(g * 0.4)
        b = Math.floor(b * 0.4)
        
        setAlbumColor(`rgb(${r}, ${g}, ${b})`)
      } catch (e) {
        setAlbumColor('rgb(20, 20, 20)')
      }
    }
  }, [currentTrack?.album?.images])

  useEffect(() => {
    setSyncedLyrics([])
    setPlainLyrics('')
    setCurrentLyricIndex(-1)
  }, [currentTrack])
  useEffect(() => {
    setLocalProgress([duration > 0 ? (progress / duration) * 100 : 0])
  }, [progress, duration])
  useEffect(() => {
    setLocalVolume([volume * 100])
  }, [volume])

  useEffect(() => {
    if (syncedLyrics.length > 0) {
      let activeIdx = -1
      for (let i = 0; i < syncedLyrics.length; i++) {
        if (syncedLyrics[i].time <= progress) activeIdx = i
        else break
      }
      if (activeIdx !== currentLyricIndex) setCurrentLyricIndex(activeIdx)
    }
  }, [progress, syncedLyrics, currentLyricIndex])

  useEffect(() => {
    if (activeLyricRef.current && lyricsContainerRef.current) {
      const container = lyricsContainerRef.current
      const activeElement = activeLyricRef.current
      const containerHeight = container.clientHeight
      const elementTop = activeElement.offsetTop
      const elementHeight = activeElement.clientHeight
      
      // Scroll to center the active lyric in the container
      const scrollTo = elementTop - (containerHeight / 2) + (elementHeight / 2)
      container.scrollTo({ top: scrollTo, behavior: 'smooth' })
    }
  }, [currentLyricIndex])

  const handleProgressChange = (value: number[]) => {
    setLocalProgress(value)
    seekTo((value[0] / 100) * duration)
  }
  const handleVolumeChange = (value: number[]) => {
    setLocalVolume(value)
    setPlayerVolume(value[0] / 100)
  }

  const toggleMute = () => {
    if (volume > 0) {
      setPlayerVolume(0)
      setLocalVolume([0])
    } else {
      setPlayerVolume(0.5)
      setLocalVolume([50])
    }
  }

  const parseLRC = (lrcString: string) => {
    const lines = lrcString.split('\n')
    const result: LyricLine[] = []
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/
    for (const line of lines) {
      const match = line.match(timeRegex)
      if (match) {
        const minutes = parseInt(match[1])
        const seconds = parseInt(match[2])
        const ms = parseInt(match[3].padEnd(3, '0').substring(0, 3))
        const time = minutes * 60 + seconds + ms / 1000
        const text = line.replace(timeRegex, '').trim()
        if (text) result.push({ time, text })
      }
    }
    return result
  }

  const fetchLyrics = async () => {
    if (!currentTrack) return
    if (syncedLyrics.length > 0 || plainLyrics) return
    setLoadingLyrics(true)
    try {
      const res = await fetch(
        `https://lrclib.net/api/get?artist_name=${encodeURIComponent(currentTrack.artists?.[0]?.name || '')}&track_name=${encodeURIComponent(currentTrack.name)}`
      )
      if (!res.ok) throw new Error('Lyrics not found')
      const data = await res.json()
      if (data.syncedLyrics) setSyncedLyrics(parseLRC(data.syncedLyrics))
      else if (data.plainLyrics) setPlainLyrics(data.plainLyrics)
      else setPlainLyrics('No lyrics found.')
    } catch (e) {
      setPlainLyrics('Lyrics not available for this song.')
    } finally {
      setLoadingLyrics(false)
    }
  }

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <>
      {isVideoOpen && currentTrack && (
        <VideoModal
          trackName={currentTrack.name}
          artistName={currentTrack.artists?.[0]?.name || ''}
          onClose={() => setIsVideoOpen(false)}
        />
      )}

      {/* --- FLOATING PLAYER CONTAINER --- */}
      <div className="fixed bottom-0 sm:bottom-4 left-0 right-0 sm:left-4 sm:right-4 z-50 flex justify-center">
        <div className="w-full max-w-screen-xl bg-background/80 sm:bg-black/60 backdrop-blur-xl border-t sm:border border-white/5 sm:rounded-2xl shadow-2xl shadow-black/40 overflow-hidden transition-all duration-300 relative group/player">
          {/* Progress Bar - Enlarges on Hover */}
          <div
            className="w-full h-1 hover:h-3 bg-white/10 cursor-pointer group transition-all duration-200 ease-out z-20 absolute top-0 left-0 right-0"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const x = e.clientX - rect.left
              const percent = (x / rect.width) * 100
              handleProgressChange([percent])
            }}
          >
            <div
              className="h-full bg-primary transition-all duration-100 ease-linear relative"
              style={{ width: `${localProgress[0]}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 bg-white rounded-full opacity-0 group-hover:opacity-100 shadow-md transition-opacity duration-200 scale-125" />
            </div>
          </div>

          <div className="flex h-20 sm:h-24 items-center justify-between px-4 sm:px-6 pt-2">
            {/* LEFT: Track Info */}
            <div className="flex w-[30%] min-w-0 items-center gap-4">
              {currentTrack ? (
                <>
                  <div className="relative group shrink-0">
                    <div className="absolute inset-0 bg-primary/20 blur-md rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <img
                      src={currentTrack.album?.images?.[0]?.url || ''}
                      alt="Album Art"
                      className="relative h-12 w-12 sm:h-14 sm:w-14 rounded-lg object-cover shadow-lg border border-white/5"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col justify-center overflow-hidden">
                    <p className="truncate text-sm font-semibold text-white/90 hover:text-white transition-colors cursor-pointer">
                      {currentTrack.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground hover:text-white/70 transition-colors cursor-pointer">
                      {currentTrack.artists?.map((a: any) => a.name).join(', ')}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={`hidden sm:flex h-9 w-9 shrink-0 hover:bg-white/10 rounded-full transition-colors ${isLiked ? 'text-primary' : 'text-muted-foreground'}`}
                    onClick={() => setIsLiked(!isLiked)}
                  >
                    <Heart className={`h-5 w-5 ${isLiked ? 'fill-current' : ''}`} />
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-3 opacity-50">
                  <div className="h-14 w-14 rounded-lg bg-white/10 animate-pulse" />
                  <div className="flex flex-col gap-2">
                    <div className="h-4 w-32 rounded bg-white/10 animate-pulse" />
                    <div className="h-3 w-20 rounded bg-white/10 animate-pulse" />
                  </div>
                </div>
              )}
            </div>

            {/* CENTER: Controls */}
            <div className="flex w-[40%] flex-col items-center justify-center gap-1 sm:gap-2">
              <div className="flex items-center gap-4 sm:gap-6">
                <Button
                  size="icon"
                  variant="ghost"
                  className={`h-8 w-8 text-muted-foreground hover:text-white hover:bg-transparent transition-colors ${isShuffled ? 'text-primary' : ''}`}
                  onClick={toggleShuffle}
                >
                  <Shuffle className="h-4 w-4" />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/5 rounded-full"
                  onClick={previousTrack}
                  disabled={!currentTrack}
                >
                  <SkipBack className="h-5 w-5" />
                </Button>

                <Button
                  size="icon"
                  className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-primary text-primary-foreground hover:scale-105 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95"
                  onClick={togglePlayPause}
                  disabled={!currentTrack || isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="h-5 w-5 sm:h-6 sm:w-6 fill-current" />
                  ) : (
                    <Play className="h-5 w-5 sm:h-6 sm:w-6 fill-current ml-1" />
                  )}
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/5 rounded-full"
                  onClick={nextTrack}
                  disabled={!currentTrack}
                >
                  <SkipForward className="h-5 w-5" />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  className={`h-8 w-8 text-muted-foreground hover:text-white hover:bg-transparent transition-colors ${repeatMode !== 'off' ? 'text-primary' : ''}`}
                  onClick={toggleRepeat}
                >
                  {repeatMode === 'one' ? (
                    <Repeat1 className="h-4 w-4" />
                  ) : (
                    <Repeat className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="flex w-full items-center justify-between gap-2 px-2">
                <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">
                  {formatTime(progress)}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono w-8">
                  {formatTime(duration)}
                </span>
              </div>
            </div>

            {/* RIGHT: Extras */}
            <div className="flex w-[30%] min-w-0 items-center justify-end gap-2 sm:gap-4">
              {/* Source Switcher */}
              {currentTrack && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-white hover:bg-white/10 rounded-full"
                      title="Sources"
                    >
                      <ListVideo className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-80 p-0 mr-4 mb-4 bg-black/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl"
                    align="end"
                    side="top"
                  >
                    <div className="p-3 border-b border-white/10 bg-white/5 flex items-center justify-between">
                      <h4 className="font-semibold text-sm text-white">Audio Sources</h4>
                      {savedSourceId && (
                        <button
                          onClick={() => clearSourcePreference()}
                          className="text-[10px] text-primary hover:text-primary/80 transition-colors"
                        >
                          Clear Saved
                        </button>
                      )}
                    </div>
                    <p className="px-3 py-2 text-[10px] text-muted-foreground border-b border-white/5">
                      Wrong song? Click <Star className="inline h-3 w-3 text-yellow-500" /> to save your preference
                    </p>
                    <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
                      {alternatives.length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          No sources found
                        </div>
                      ) : (
                        alternatives.map((item, idx) => {
                          const itemId = item.id || item.url
                          const isSaved = savedSourceId === itemId

                          return (
                            <div
                              key={idx}
                              className={`w-full p-2 rounded-lg flex items-center gap-3 transition-colors group ${
                                isSaved ? 'bg-primary/20 border border-primary/30' : 'hover:bg-white/10'
                              }`}
                            >
                              <button
                                onClick={() => changeSource(item)}
                                className="flex items-center gap-3 flex-1 text-left min-w-0"
                              >
                                <div className="h-9 w-9 rounded-md overflow-hidden bg-white/5 shrink-0 relative">
                                  <img
                                    src={item.thumbnail || item.image?.[0]?.url}
                                    className="h-full w-full object-cover"
                                  />
                                  {isSaved && (
                                    <div className="absolute inset-0 bg-primary/30 flex items-center justify-center">
                                      <Check className="h-4 w-4 text-white" />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p
                                    className={`text-sm font-medium truncate ${
                                      isSaved ? 'text-primary' : 'text-white/90 group-hover:text-primary'
                                    }`}
                                  >
                                    {item.title || item.name}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                                    {item.channelTitle || item.artists?.[0]?.name}
                                    {item.isJioSaavn && (
                                      <span className="bg-green-500/20 text-green-400 px-1 rounded text-[8px] font-medium">
                                        JioSaavn
                                      </span>
                                    )}
                                    {item.isVideoSource && (
                                      <span className="bg-red-500/20 text-red-400 px-1 rounded text-[8px] font-medium">
                                        Video
                                      </span>
                                    )}
                                    {isSaved && ' • Saved'}
                                  </p>
                                </div>
                              </button>
                              <button
                                onClick={() => {
                                  if (isSaved) {
                                    // Already saved - clicking clears the preference
                                    clearSourcePreference()
                                  } else {
                                    // Not saved - save this as preferred
                                    changeSource(item, true)
                                  }
                                }}
                                className={`p-1.5 rounded-full transition-all shrink-0 ${
                                  isSaved
                                    ? 'text-yellow-500 bg-yellow-500/20'
                                    : 'text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10 opacity-0 group-hover:opacity-100'
                                }`}
                                title={isSaved ? 'Clear saved preference' : 'Set as preferred source'}
                              >
                                <Star className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
                              </button>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Video Toggle */}
              {currentTrack && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors"
                  onClick={() => {
                    setIsVideoOpen(true)
                    if (isPlaying) togglePlayPause()
                  }}
                  title="Watch Video"
                >
                  <MonitorPlay className="h-4 w-4" />
                </Button>
              )}

              {/* Lyrics */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-white hover:bg-white/10 rounded-full"
                    onClick={fetchLyrics}
                    disabled={!currentTrack}
                  >
                    <Mic2 className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent 
                  side="bottom" 
                  className="h-[100vh] w-full border-t border-white/10 p-0 lyrics-animated-bg"
                  style={{ background: `linear-gradient(135deg, ${albumColor} 0%, rgb(15, 15, 15) 40%, ${albumColor} 100%)` }}
                >
                  <SheetTitle className="sr-only">Song Lyrics</SheetTitle>
                  <div className="h-full flex flex-col md:flex-row">
                    {/* Left Side - Album Art & Track Info */}
                    <div className="w-full md:w-2/5 flex flex-col items-center justify-center p-8 md:p-12">
                      <div className="relative group">
                        <div className="w-48 h-48 md:w-64 md:h-64 rounded-lg shadow-2xl overflow-hidden">
                          {currentTrack?.album?.images?.[0]?.url ? (
                            <img
                              src={currentTrack.album.images[0].url}
                              alt={currentTrack.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
                              <Mic2 className="h-16 w-16 text-white/50" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-6 text-center max-w-[280px]">
                        <h2 className="text-lg md:text-xl font-bold text-white truncate">
                          {currentTrack?.name || 'No track'}
                        </h2>
                        <p className="text-sm text-white/60 mt-1 truncate">
                          {currentTrack?.artists?.map((a: any) => a.name).join(', ')}
                        </p>
                      </div>
                    </div>

                    {/* Right Side - Lyrics */}
                    <div className="flex-1 flex flex-col overflow-hidden md:border-l border-white/5">
                      <div 
                        ref={lyricsContainerRef}
                        className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-hide" 
                        style={{ maskImage: 'linear-gradient(transparent, black 15%, black 85%, transparent)' }}
                      >
                        {loadingLyrics ? (
                          <div className="flex h-full flex-col items-center justify-center gap-4">
                            <Loader2 className="h-8 w-8 animate-spin text-white/50" />
                            <p className="text-white/40">Loading lyrics...</p>
                          </div>
                        ) : syncedLyrics.length > 0 ? (
                          <div className="flex flex-col gap-8 py-32">
                            {syncedLyrics.map((line, i) => {
                              const isActive = i === currentLyricIndex
                              const isPast = i < currentLyricIndex
                              const distance = Math.abs(i - currentLyricIndex)
                              
                              return (
                                <p
                                  key={i}
                                  ref={isActive ? activeLyricRef : null}
                                  className={`
                                    text-left transition-all duration-500 cursor-pointer leading-relaxed tracking-wide
                                    font-serif italic
                                    ${isActive 
                                      ? 'text-2xl md:text-4xl font-bold scale-105' 
                                      : isPast 
                                        ? 'text-lg md:text-xl text-white/25' 
                                        : 'text-lg md:text-xl text-white/35'
                                    }
                                    ${distance > 3 ? 'opacity-20' : ''}
                                    hover:text-white/60
                                  `}
                                  style={isActive ? { 
                                    color: lyricAccentColor,
                                    textShadow: `0 0 20px ${lyricAccentColor}, 0 0 40px ${lyricAccentColor}40, 0 0 60px ${lyricAccentColor}20`
                                  } : undefined}
                                  onClick={(e) => { e.stopPropagation(); seekTo(line.time) }}
                                >
                                  {line.text}
                                </p>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center">
                            <p className="text-white/40 text-center whitespace-pre-wrap leading-loose max-w-md">
                              {plainLyrics || 'No lyrics available for this song.'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              {/* Queue Button */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-white hover:bg-white/10 rounded-full"
                    title="Queue"
                  >
                    <ListMusic className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-80 p-0 mr-4 mb-4 bg-black/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl"
                  align="end"
                  side="top"
                >
                  <div className="border-b border-white/10 p-3 bg-white/5 flex justify-between items-center">
                    <h4 className="font-semibold text-sm text-white">Play Queue</h4>
                    <div className="flex items-center gap-2">
                      {queue.length > 0 && (
                        <button
                          onClick={() => clearQueue()}
                          className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                        >
                          Clear All
                        </button>
                      )}
                      <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-white/70">
                        {queue.length}
                      </span>
                    </div>
                  </div>
                  <div className="max-h-[50vh] overflow-y-auto w-full custom-scrollbar p-1">
                    {queue.length === 0 ? (
                      <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
                        <p>Queue is empty</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {queue.map((track, i) => (
                          <button
                            key={`${track.id}-${i}`}
                            className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/10 rounded-lg transition-colors group ${currentTrack?.id === track.id ? 'bg-primary/20' : ''}`}
                            onClick={() => playTrack(track)}
                          >
                            <div className="h-8 w-8 rounded overflow-hidden bg-white/5 shrink-0">
                              <img
                                src={track.album?.images?.[0]?.url}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p
                                className={`truncate text-sm font-medium ${currentTrack?.id === track.id ? 'text-primary' : 'text-white/90 group-hover:text-white'}`}
                              >
                                {track.name}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {track.artists?.map((a: any) => a.name).join(', ')}
                              </p>
                            </div>
                            {currentTrack?.id === track.id && isPlaying && (
                              <div className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-white hover:bg-white/10 rounded-full hidden sm:flex"
                onClick={() => currentTrack && downloadTrack(currentTrack)}
                disabled={!currentTrack}
              >
                <Download className="h-4 w-4" />
              </Button>

              <div className="hidden sm:flex items-center gap-2 group/volume">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-white"
                  onClick={toggleMute}
                >
                  {volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
                <div className="w-0 overflow-hidden group-hover/volume:w-20 transition-all duration-300">
                  <Slider
                    value={localVolume}
                    onValueChange={handleVolumeChange}
                    max={100}
                    step={1}
                    className="w-20"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
