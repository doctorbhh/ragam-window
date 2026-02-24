import { X, Loader2, MonitorPlay, Settings, Volume2, VolumeX, Maximize, Pause, Play } from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'

// Quality options
const QUALITY_OPTIONS = [
  { label: '1080p', value: 1080 },
  { label: '720p', value: 720 },
  { label: '480p', value: 480 },
  { label: '360p', value: 360 }
]

interface VideoModalProps {
  trackName: string
  artistName: string
  onClose: () => void
  videoId?: string | null
}

interface VideoStreamData {
  type: 'muxed' | 'dash'
  url?: string
  videoUrl?: string
  audioUrl?: string
  title?: string
  duration?: number
  height?: number
  width?: number
  format?: string
  thumbnail?: string
}

const VideoModal = ({
  trackName,
  artistName,
  onClose,
  videoId: hardcodedVideoId = null
}: VideoModalProps) => {
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [finalVideoId, setFinalVideoId] = useState<string | null>(hardcodedVideoId)
  const [retryCount, setRetryCount] = useState(0)
  
  // Video player state
  const [streamData, setStreamData] = useState<VideoStreamData | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [selectedQuality, setSelectedQuality] = useState(720)
  const [showQualityMenu, setShowQualityMenu] = useState(false)
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Search for video ID if not provided
  useEffect(() => {
    const searchYouTubeVideo = async () => {
      if (hardcodedVideoId) {
        setFinalVideoId(hardcodedVideoId)
        return
      }

      if (!trackName || !artistName) {
        setError('No track info provided')
        setLoading(false)
        return
      }

      try {
        const query = `${trackName} ${artistName} official music video`
        const res = await fetch(
          `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=videos`
        )

        if (!res.ok) throw new Error('Search failed')

        const data = await res.json()

        if (data.items?.length > 0) {
          const url = data.items[0].url
          const id = url.split('v=')[1]?.split('&')[0]
          if (id) {
            setFinalVideoId(id)
          } else {
            setError('Invalid video URL')
            setLoading(false)
          }
        } else {
          setError('No video found')
          setLoading(false)
        }
      } catch (err) {
        console.error('YouTube search failed:', err)
        setError('Failed to find video')
        setLoading(false)
      }
    }

    searchYouTubeVideo()
  }, [trackName, artistName, hardcodedVideoId])

  // Fetch video stream when we have a video ID
  useEffect(() => {
    if (!finalVideoId) return

    const fetchStream = async () => {
      setLoading(true)
      setError(null)

      try {
        // Use the quality-aware stream API
        const data = await window.electron.youtube.getVideoStream(finalVideoId, selectedQuality)
        
        if (!data) {
          throw new Error('Failed to get video stream')
        }

        console.log('[VideoModal] Stream data:', data)
        setStreamData(data)
      } catch (err: any) {
        console.error('Failed to fetch stream:', err)
        setError(err.message || 'Failed to load video')
      } finally {
        setLoading(false)
      }
    }

    fetchStream()
  }, [finalVideoId, selectedQuality, retryCount])

  // Setup video playback based on stream type
  useEffect(() => {
    if (!streamData || !videoRef.current) return

    const video = videoRef.current
    const audio = audioRef.current

    // Clear any existing sources
    video.pause()
    video.src = ''
    if (audio) {
      audio.pause()
      audio.src = ''
    }

    if (streamData.type === 'muxed' && streamData.url) {
      // Muxed MP4: Direct playback (most reliable)
      console.log('[VideoModal] Setting up muxed MP4 playback:', streamData.height + 'p')
      video.src = streamData.url
      video.load()
      video.play().catch(e => {
        console.error('Video play failed:', e)
        setError('Failed to play video. Try a different quality.')
      })

    } else if (streamData.type === 'dash' && streamData.videoUrl && streamData.audioUrl && audio) {
      // DASH: Separate video + audio streams
      console.log('[VideoModal] Setting up DASH playback')
      video.src = streamData.videoUrl
      audio.src = streamData.audioUrl
      audio.volume = volume
      audio.muted = isMuted

      // Sync audio with video
      const syncAudio = () => {
        if (Math.abs(video.currentTime - audio.currentTime) > 0.1) {
          audio.currentTime = video.currentTime
        }
      }

      const handlePlay = () => {
        audio.play().catch(console.error)
        setIsPlaying(true)
      }
      const handlePause = () => {
        audio.pause()
        setIsPlaying(false)
      }

      video.addEventListener('play', handlePlay)
      video.addEventListener('pause', handlePause)
      video.addEventListener('seeked', syncAudio)
      video.addEventListener('timeupdate', syncAudio)

      video.load()
      video.play().catch(e => {
        console.error('Video play failed:', e)
        setError('Failed to play video. Try a different quality.')
      })

      return () => {
        video.removeEventListener('play', handlePlay)
        video.removeEventListener('pause', handlePause)
        video.removeEventListener('seeked', syncAudio)
        video.removeEventListener('timeupdate', syncAudio)
      }
    }
  }, [streamData])

  // Common video event listeners
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onTimeUpdate = () => setCurrentTime(video.currentTime)
    const onDurationChange = () => setDuration(video.duration)
    const onError = (e: Event) => {
      console.error('Video error:', e)
      // Don't set error if already set or if no source
      if (!error && video.src) {
        setError('Video playback failed. Try a different quality.')
      }
    }

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('error', onError)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('error', onError)
    }
  }, [error])

  // Sync volume changes with audio element (for DASH)
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
      audioRef.current.muted = isMuted
    }
    if (videoRef.current) {
      videoRef.current.volume = volume
      videoRef.current.muted = isMuted
    }
  }, [volume, isMuted])

  // Auto-hide controls
  const handleMouseMove = useCallback(() => {
    setShowControls(true)
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false)
    }, 3000)
  }, [isPlaying])

  const togglePlayPause = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      videoRef.current.play()
    } else {
      videoRef.current.pause()
    }
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    const newTime = percent * duration
    videoRef.current.currentTime = newTime
    if (audioRef.current) {
      audioRef.current.currentTime = newTime
    }
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current.requestFullscreen()
    }
  }

  const toggleMute = () => setIsMuted(!isMuted)

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleQualityChange = (quality: number) => {
    setSelectedQuality(quality)
    setShowQualityMenu(false)
    // Stream will reload due to useEffect dependency
  }

  const handleRetry = () => {
    setError(null)
    setRetryCount((prev) => prev + 1)
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-md p-4">
        <div className="relative w-full max-w-5xl bg-black rounded-2xl overflow-hidden shadow-2xl">
          <div className="relative w-full pt-[56.25%] bg-black">
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <Loader2 className="h-12 w-12 animate-spin text-red-500 mb-4" />
              <p className="text-lg">Loading {selectedQuality}p video...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        className="relative w-full max-w-5xl bg-black rounded-2xl overflow-hidden shadow-2xl border border-zinc-800"
        onClick={(e) => e.stopPropagation()}
        onMouseMove={handleMouseMove}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white hover:bg-red-600 transition-all backdrop-blur-sm shadow-lg"
          aria-label="Close video"
        >
          <X size={24} strokeWidth={2.5} />
        </button>

        {/* 16:9 Responsive Container */}
        <div className="relative w-full pt-[56.25%] bg-zinc-900">
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 p-8">
              <MonitorPlay size={64} className="mb-4 opacity-50" />
              <p className="text-lg text-center mb-4">{error}</p>
              <div className="flex gap-2">
                <button
                  onClick={handleRetry}
                  className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition text-white"
                >
                  Retry ({retryCount + 1})
                </button>
                <button
                  onClick={() => handleQualityChange(selectedQuality === 720 ? 480 : 360)}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition text-white"
                >
                  Try Lower Quality
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-2 bg-red-600 hover:bg-red-500 rounded-lg transition text-white"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Video Element */}
              <video
                ref={videoRef}
                className="absolute top-0 left-0 w-full h-full bg-black cursor-pointer"
                onClick={togglePlayPause}
                playsInline
                crossOrigin="anonymous"
              />
              
              {/* Hidden Audio Element for DASH playback */}
              {streamData?.type === 'dash' && (
                <audio ref={audioRef} className="hidden" crossOrigin="anonymous" />
              )}

              {/* Custom Controls Overlay */}
              <div 
                className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 transition-opacity duration-300 ${
                  showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                {/* Progress Bar */}
                <div 
                  className="w-full h-1 bg-zinc-600 rounded-full mb-3 cursor-pointer group"
                  onClick={handleSeek}
                >
                  <div 
                    className="h-full bg-red-500 rounded-full relative group-hover:h-1.5 transition-all"
                    style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>

                {/* Controls Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Play/Pause */}
                    <button 
                      onClick={togglePlayPause}
                      className="p-2 rounded-full hover:bg-white/20 transition"
                    >
                      {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                    </button>

                    {/* Volume */}
                    <div className="flex items-center gap-2">
                      <button onClick={toggleMute} className="p-2 rounded-full hover:bg-white/20 transition">
                        {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="w-20 accent-red-500"
                      />
                    </div>

                    {/* Time */}
                    <span className="text-sm text-zinc-300">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Quality Selector */}
                    <div className="relative">
                      <button 
                        onClick={() => setShowQualityMenu(!showQualityMenu)}
                        className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 transition flex items-center gap-2 text-sm"
                      >
                        <Settings size={16} />
                        {streamData?.height || selectedQuality}p
                      </button>
                      
                      {showQualityMenu && (
                        <div className="absolute bottom-full right-0 mb-2 bg-zinc-800 rounded-lg overflow-hidden shadow-xl">
                          {QUALITY_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => handleQualityChange(option.value)}
                              className={`w-full px-4 py-2 text-left hover:bg-zinc-700 transition text-sm ${
                                selectedQuality === option.value ? 'bg-red-600' : ''
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Fullscreen */}
                    <button 
                      onClick={toggleFullscreen}
                      className="p-2 rounded-full hover:bg-white/20 transition"
                    >
                      <Maximize size={20} />
                    </button>
                  </div>
                </div>

                {/* Video Title */}
                <p className="text-sm text-zinc-400 mt-2 truncate">
                  {streamData?.title || `${trackName} - ${artistName}`}
                  {streamData?.height && <span className="text-zinc-500 ml-2">({streamData.height}p {streamData.format || 'mp4'})</span>}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default VideoModal
