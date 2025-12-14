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
  Settings
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useState, useEffect, useRef, useCallback } from 'react'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Video State
  const [videoAlternatives, setVideoAlternatives] = useState<any[]>([])
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null)

  // HLS State
  const [hlsInstance, setHlsInstance] = useState<Hls | null>(null)
  const [levels, setLevels] = useState<any[]>([])
  const [currentLevel, setCurrentLevel] = useState(-1) // -1 = Auto

  // 1. Initial Search (Finds top 5 videos)
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
    if (hlsInstance) {
      hlsInstance.destroy()
      setHlsInstance(null)
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
            setHlsInstance(hls)
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
    if (hlsInstance) {
      hlsInstance.currentLevel = levelIndex
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
    changeSource
  } = usePlayer()

  const [isLiked, setIsLiked] = useState(false)
  const [localProgress, setLocalProgress] = useState([0])
  const [localVolume, setLocalVolume] = useState([volume * 100])
  const [isVideoOpen, setIsVideoOpen] = useState(false)

  // --- KEYBOARD SHORTCUTS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

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

  useEffect(() => {
    setSyncedLyrics([])
    setPlainLyrics('')
    setCurrentLyricIndex(-1)
  }, [currentTrack])
  useEffect(() => {
    setLocalProgress([duration > 0 ? (progress / duration) * 100 : 0])
  }, [progress, duration])

  // Sync local volume with context volume
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
    if (activeLyricRef.current)
      activeLyricRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
        <div className="w-full max-w-screen-xl bg-background/80 sm:bg-black/60 backdrop-blur-xl border-t sm:border border-white/5 sm:rounded-2xl shadow-2xl shadow-black/40 overflow-hidden transition-all duration-300">
          {/* Progress Bar */}
          <div
            className="w-full h-1 bg-white/5 cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const x = e.clientX - rect.left
              const percent = (x / rect.width) * 100
              handleProgressChange([percent])
            }}
          >
            <div
              className="h-full bg-primary transition-all duration-100 ease-linear group-hover:h-1.5 relative"
              style={{ width: `${localProgress[0]}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 bg-white rounded-full opacity-0 group-hover:opacity-100 shadow-md transition-opacity" />
            </div>
          </div>

          <div className="flex h-20 sm:h-24 items-center justify-between px-4 sm:px-6">
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
                    className={`hidden sm:flex h-9 w-9 shrink-0 hover:bg-white/10 rounded-full transition-colors ${
                      isLiked ? 'text-primary' : 'text-muted-foreground'
                    }`}
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
                      title="Audio Sources"
                    >
                      <ListVideo className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-72 p-0 mr-4 mb-4 bg-black/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl"
                    align="end"
                    side="top"
                  >
                    <div className="p-3 border-b border-white/10 bg-white/5">
                      <h4 className="font-semibold text-sm text-white">Audio Sources</h4>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
                      {alternatives.length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          No sources found
                        </div>
                      ) : (
                        alternatives.map((item, idx) => (
                          <button
                            key={idx}
                            onClick={() => changeSource(item)}
                            className="w-full text-left p-2 hover:bg-white/10 rounded-lg flex items-center gap-3 transition-colors group"
                          >
                            <div className="h-9 w-9 rounded-md overflow-hidden bg-white/5 shrink-0">
                              <img
                                src={item.thumbnail || item.image?.[0]?.url}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate text-white/90 group-hover:text-primary">
                                {item.title || item.name}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {item.channelTitle || item.artists?.[0]?.name}
                              </p>
                            </div>
                          </button>
                        ))
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
                <SheetContent className="overflow-hidden flex flex-col w-full sm:max-w-md bg-black/80 backdrop-blur-2xl border-l border-white/10">
                  <SheetHeader>
                    <SheetTitle className="text-center text-xl font-bold text-white tracking-tight">
                      Lyrics
                    </SheetTitle>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto px-6 mt-8 pb-20 scrollbar-hide mask-image-gradient">
                    {loadingLyrics ? (
                      <div className="flex h-full flex-col items-center justify-center gap-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-muted-foreground">Fetching...</p>
                      </div>
                    ) : syncedLyrics.length > 0 ? (
                      <div className="flex flex-col gap-8 py-10">
                        {syncedLyrics.map((line, i) => (
                          <p
                            key={i}
                            className={`text-center transition-all duration-500 cursor-pointer ${i === currentLyricIndex ? 'text-2xl font-bold text-primary scale-110 drop-shadow-md' : 'text-lg text-muted-foreground/40 hover:text-muted-foreground/80'}`}
                            onClick={() => seekTo(line.time)}
                          >
                            {line.text}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap text-center text-lg leading-loose font-medium text-white/70 py-10">
                        {plainLyrics || 'No lyrics available.'}
                      </div>
                    )}
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
                    <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-white/70">
                      {queue.length}
                    </span>
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

              {/* Download Button */}
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-white hover:bg-white/10 rounded-full hidden sm:flex"
                onClick={() => currentTrack && downloadTrack(currentTrack)}
                disabled={!currentTrack}
              >
                <Download className="h-4 w-4" />
              </Button>

              {/* Volume */}
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
