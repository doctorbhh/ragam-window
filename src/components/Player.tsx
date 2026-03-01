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
  Plus,
  Music,
  Loader2,
  Download,
  MonitorPlay,
  X,
  ListVideo,
  Settings,
  Star,
  Search,
  Save,
  Check,
  Eye
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
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
  
  // Download Progress State
  const [downloadProgress, setDownloadProgress] = useState<{
    status: 'idle' | 'downloading' | 'complete' | 'error'
    progress?: number
    message?: string
  }>({ status: 'idle' })

  // HLS State
  const [levels, setLevels] = useState<any[]>([])
  const [currentLevel, setCurrentLevel] = useState(-1) // -1 = Auto

  // Cleanup function - runs when modal closes
  useEffect(() => {
    // Subscribe to download progress events
    // @ts-ignore
    window.electron.youtube.onVideoProgress((data: any) => {
      if (data.videoId === currentVideoId) {
        setDownloadProgress({
          status: data.status,
          progress: data.progress,
          message: data.message
        })
      }
    })
    
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
      // Remove progress listener
      // @ts-ignore
      window.electron.youtube.removeVideoProgressListener()
    }
  }, [currentVideoId])

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

  // 2. Load Specific Stream (Helper Function) - Uses muxed MP4 to avoid 403 errors
  const loadVideoStream = async (videoId: string, maxHeight = 720) => {
    // Cleanup previous HLS if exists
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    setLoading(true)
    setCurrentVideoId(videoId)

    try {
      // Use the new muxed MP4 API to avoid 403 errors from HLS segments
      // @ts-ignore
      const streamData = await window.electron.youtube.getVideoStream(videoId, maxHeight)

      if (!streamData || !streamData.url) throw new Error('Stream extraction failed')

      const video = videoRef.current
      if (!video) return

      // Store available qualities for the quality selector
      if (streamData.qualities && streamData.qualities.length > 0) {
        const qualityLevels = streamData.qualities.map((q: string) => ({ 
          height: parseInt(q.replace('p', '')) 
        }))
        setLevels(qualityLevels)
        setCurrentLevel(streamData.height || parseInt(streamData.qualities[0].replace('p', '')))
      }

      // For muxed MP4 streams, just set the source directly - no HLS needed
      console.log('[VideoModal] Playing muxed stream:', streamData.height + 'p')
      video.src = streamData.url
      video.play().catch((e) => console.error('Autoplay blocked', e))
      
      setError(null)
    } catch (err) {
      console.error('Stream Error:', err)
      setError('Unable to load video stream.')
    } finally {
      setLoading(false)
    }
  }

  // Switch video quality - reloads stream with new quality
  const changeQuality = async (height: number) => {
    if (!currentVideoId) return
    const video = videoRef.current
    if (!video) return
    
    // Remember current playback position
    const currentTime = video.currentTime
    const wasPlaying = !video.paused
    
    console.log(`[VideoModal] Switching quality to ${height}p`)
    setLoading(true)
    
    try {
      // Get new stream URL with selected quality
      // @ts-ignore
      const streamData = await window.electron.youtube.getVideoStream(currentVideoId, height)
      
      if (streamData?.url) {
        video.src = streamData.url
        
        // Wait for video to load metadata before seeking
        video.onloadedmetadata = () => {
          video.currentTime = currentTime
          if (wasPlaying) {
            video.play().catch((e) => console.error('Play failed', e))
          }
        }
        
        setCurrentLevel(height)
      }
    } catch (err) {
      console.error('Quality change error:', err)
    } finally {
      setLoading(false)
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
      {/* DOWNLOAD PROGRESS OVERLAY */}
      {downloadProgress.status === 'downloading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-50">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-white/20 border-t-primary rounded-full animate-spin" />
            <p className="text-white text-lg font-medium">
              {downloadProgress.progress 
                ? `Downloading: ${downloadProgress.progress.toFixed(0)}%` 
                : 'Preparing high-quality video...'}
            </p>
            <p className="text-white/60 text-sm">This may take a moment for 1080p quality</p>
            {downloadProgress.progress && (
              <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${downloadProgress.progress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}
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
                        alt={video.title || 'Video thumbnail'}
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
                <div className="px-3 py-1 text-xs text-white/50 border-b border-white/10 mb-1">Quality</div>
                {levels
                  .sort((a, b) => b.height - a.height)
                  .map((level) => (
                    <button
                      key={level.height}
                      onClick={() => changeQuality(level.height)}
                      className={`text-left px-3 py-2 text-sm rounded-lg hover:bg-white/10 transition-colors ${currentLevel === level.height ? 'text-primary font-bold bg-white/5' : ''}`}
                    >
                      {level.height}p {currentLevel === level.height && '✓'}
                    </button>
                  ))}
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

  const [playerPlaylistOpen, setPlayerPlaylistOpen] = useState(false)
  const [playerPlaylists, setPlayerPlaylists] = useState<any[]>([])
  const [playerShowNameInput, setPlayerShowNameInput] = useState(false)
  const [playerNewName, setPlayerNewName] = useState('')
  const [localProgress, setLocalProgress] = useState([0])
  const [localVolume, setLocalVolume] = useState([volume * 100])
  const [isVideoOpen, setIsVideoOpen] = useState(false)



  // --- LYRICS STATE ---
  interface LyricLine {
    time: number
    text: string
  }
  interface LyricsSearchResult {
    id: number
    name: string
    trackName: string
    artistName: string
    albumName?: string
    duration: number
    syncedLyrics?: string
    plainLyrics?: string
  }
  const [syncedLyrics, setSyncedLyrics] = useState<LyricLine[]>([])
  const [plainLyrics, setPlainLyrics] = useState('')
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1)
  const [loadingLyrics, setLoadingLyrics] = useState(false)
  const activeLyricRef = useRef<HTMLParagraphElement>(null)
  const lyricsContainerRef = useRef<HTMLDivElement>(null)
  
  // --- LYRICS SEARCH STATE ---
  const [lyricsSearchQuery, setLyricsSearchQuery] = useState('')
  const [lyricsSearchResults, setLyricsSearchResults] = useState<LyricsSearchResult[]>([])
  const [searchingLyrics, setSearchingLyrics] = useState(false)
  const [showLyricsSearch, setShowLyricsSearch] = useState(false)
  const [savedLyricsQuery, setSavedLyricsQuery] = useState<string | null>(null)
  const [previewLyrics, setPreviewLyrics] = useState<LyricsSearchResult | null>(null)
  const [lyricsSheetOpen, setLyricsSheetOpen] = useState(false)
  
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

  // Clear lyrics and auto-fetch when track changes (if lyrics sheet is open)
  useEffect(() => {
    setSyncedLyrics([])
    setPlainLyrics('')
    setCurrentLyricIndex(-1)
    setSavedLyricsQuery(null)
    setShowLyricsSearch(false)
    setLyricsSearchResults([])
    
    // Auto-fetch if lyrics sheet is open
    if (lyricsSheetOpen && currentTrack) {
      // Small delay to ensure state is cleared
      const timer = setTimeout(() => {
        fetchLyrics()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [currentTrack?.id])
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
        case 'KeyM':
          toggleMute()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlayPause, volume, setPlayerVolume, previousTrack, nextTrack, toggleMute])

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
    // Don't return early if lyrics exist - allow re-fetching for new track
    // The caller should clear lyrics before calling this if needed
    if (loadingLyrics) return // Prevent duplicate fetches
    setLoadingLyrics(true)
    
    // Initialize search query with current track info
    const artistName = currentTrack.artists?.[0]?.name || ''
    const defaultQuery = `${currentTrack.name} ${artistName}`
    setLyricsSearchQuery(defaultQuery)
    
    // Create track key for preference lookup
    const allArtists = currentTrack.artists?.map((a: any) => a.name).join('_') || ''
    const trackKey = `${currentTrack.name}_${allArtists}`.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 100)
    
    try {
      // Check for saved lyrics preference first
      const savedPref = await window.electron.lyricsPref.get(trackKey)
      if (savedPref) {
        console.log('[Lyrics] Using saved preference:', savedPref.searchQuery)
        setSavedLyricsQuery(savedPref.searchQuery)
        if (savedPref.syncedLyrics) {
          setSyncedLyrics(parseLRC(savedPref.syncedLyrics))
        } else if (savedPref.plainLyrics) {
          setPlainLyrics(savedPref.plainLyrics)
        }
        setLoadingLyrics(false)
        return
      }
      
      // No saved preference, fetch from LRCLIB
      const res = await fetch(
        `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artistName)}&track_name=${encodeURIComponent(currentTrack.name)}`
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

  // Search LRCLIB for lyrics with custom query
  const searchLyrics = async () => {
    if (!lyricsSearchQuery.trim()) return
    setSearchingLyrics(true)
    setLyricsSearchResults([])
    
    try {
      const res = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(lyricsSearchQuery.trim())}`
      )
      if (!res.ok) throw new Error('Search failed')
      const results = await res.json()
      setLyricsSearchResults(results.slice(0, 10)) // Limit to 10 results
    } catch (e) {
      console.error('Lyrics search failed:', e)
      setLyricsSearchResults([])
    } finally {
      setSearchingLyrics(false)
    }
  }

  // Apply selected lyrics result
  const selectLyrics = (result: LyricsSearchResult) => {
    if (result.syncedLyrics) {
      setSyncedLyrics(parseLRC(result.syncedLyrics))
      setPlainLyrics('')
    } else if (result.plainLyrics) {
      setPlainLyrics(result.plainLyrics)
      setSyncedLyrics([])
    }
    setShowLyricsSearch(false)
    setLyricsSearchResults([])
  }

  // Save lyrics preference for current track
  const saveLyricsPreference = async (result: LyricsSearchResult) => {
    if (!currentTrack) return
    
    const allArtists = currentTrack.artists?.map((a: any) => a.name).join('_') || ''
    const trackKey = `${currentTrack.name}_${allArtists}`.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 100)
    
    try {
      await window.electron.lyricsPref.set(trackKey, {
        searchQuery: lyricsSearchQuery,
        syncedLyrics: result.syncedLyrics,
        plainLyrics: result.plainLyrics,
        source: 'LRCLIB manual search'
      })
      setSavedLyricsQuery(lyricsSearchQuery)
      selectLyrics(result)
      console.log('[Lyrics] Saved preference for:', trackKey)
    } catch (e) {
      console.error('Failed to save lyrics preference:', e)
    }
  }

  // Clear saved lyrics preference
  const clearLyricsPreference = async () => {
    if (!currentTrack) return
    
    const allArtists = currentTrack.artists?.map((a: any) => a.name).join('_') || ''
    const trackKey = `${currentTrack.name}_${allArtists}`.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 100)
    
    try {
      await window.electron.lyricsPref.delete(trackKey)
      setSavedLyricsQuery(null)
      // Clear current lyrics and refetch
      setSyncedLyrics([])
      setPlainLyrics('')
      setLoadingLyrics(true)
      
      const artistName = currentTrack.artists?.[0]?.name || ''
      const res = await fetch(
        `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artistName)}&track_name=${encodeURIComponent(currentTrack.name)}`
      )
      if (res.ok) {
        const data = await res.json()
        if (data.syncedLyrics) setSyncedLyrics(parseLRC(data.syncedLyrics))
        else if (data.plainLyrics) setPlainLyrics(data.plainLyrics)
        else setPlainLyrics('No lyrics found.')
      }
    } catch (e) {
      console.error('Failed to clear lyrics preference:', e)
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
        <div className="player-glow w-full max-w-screen-xl bg-background/80 sm:bg-black/60 backdrop-blur-xl border-t sm:border border-white/5 sm:rounded-2xl shadow-2xl shadow-black/40 overflow-hidden transition-all duration-300 relative group/player">
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
                  <Popover open={playerPlaylistOpen} onOpenChange={(open) => { setPlayerPlaylistOpen(open); if (!open) { setPlayerShowNameInput(false); setPlayerNewName('') } }}>
                    <PopoverTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="hidden sm:flex h-9 w-9 shrink-0 hover:bg-white/10 rounded-full transition-colors text-muted-foreground"
                        onClick={async () => {
                          try {
                            const saved = await window.electron.savedPlaylists.getAll()
                            setPlayerPlaylists((saved || []).filter((p: any) => p.id?.startsWith('local-')))
                          } catch { setPlayerPlaylists([]) }
                        }}
                        aria-label="Add to playlist"
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-0 bg-popover border border-border/10 shadow-xl rounded-xl" align="start">
                      <div className="p-2 border-b border-border/10">
                        <p className="text-xs font-semibold text-foreground px-1">Add to Playlist</p>
                      </div>
                      <div className="p-1 max-h-48 overflow-y-auto">
                        {playerShowNameInput ? (
                          <div className="px-2 py-1.5">
                            <input
                              autoFocus
                              type="text"
                              placeholder="Playlist name..."
                              value={playerNewName}
                              onChange={(e) => setPlayerNewName(e.target.value)}
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter' && currentTrack) {
                                  const name = playerNewName.trim() || `My Playlist ${new Date().toLocaleDateString()}`
                                  const newId = `local-${Date.now()}`
                                  await window.electron.savedPlaylists.add({ id: newId, name, description: '', imageUrl: currentTrack.album?.images?.[0]?.url, trackCount: 1 })
                                  await window.electron.playlistTracks.add(newId, { id: currentTrack.id, name: currentTrack.name, uri: currentTrack.uri, duration_ms: currentTrack.duration_ms, artists: currentTrack.artists, album: currentTrack.album, external_urls: currentTrack.external_urls })
                                  toast.success(`Created "${name}" with "${currentTrack.name}"`)
                                  setPlayerNewName(''); setPlayerShowNameInput(false); setPlayerPlaylistOpen(false)
                                }
                              }}
                              className="w-full bg-accent/50 border border-border/20 rounded-lg px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <div className="flex gap-1 mt-1">
                              <Button size="sm" variant="ghost" className="h-6 text-xs flex-1" onClick={() => { setPlayerShowNameInput(false); setPlayerNewName('') }}>Cancel</Button>
                              <Button size="sm" className="h-6 text-xs flex-1" onClick={async () => {
                                if (!currentTrack) return
                                const name = playerNewName.trim() || `My Playlist ${new Date().toLocaleDateString()}`
                                const newId = `local-${Date.now()}`
                                await window.electron.savedPlaylists.add({ id: newId, name, description: '', imageUrl: currentTrack.album?.images?.[0]?.url, trackCount: 1 })
                                await window.electron.playlistTracks.add(newId, { id: currentTrack.id, name: currentTrack.name, uri: currentTrack.uri, duration_ms: currentTrack.duration_ms, artists: currentTrack.artists, album: currentTrack.album, external_urls: currentTrack.external_urls })
                                toast.success(`Created "${name}" with "${currentTrack.name}"`)
                                setPlayerNewName(''); setPlayerShowNameInput(false); setPlayerPlaylistOpen(false)
                              }}>Create</Button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setPlayerShowNameInput(true)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-foreground hover:bg-accent/50 rounded-lg transition-colors text-left"
                          >
                            <Plus className="h-3.5 w-3.5 text-primary" />
                            New Playlist
                          </button>
                        )}
                        {playerPlaylists.map((pl: any) => (
                          <button
                            key={pl.id}
                            onClick={async () => {
                              if (!currentTrack) return
                              await window.electron.playlistTracks.add(pl.id, { id: currentTrack.id, name: currentTrack.name, uri: currentTrack.uri, duration_ms: currentTrack.duration_ms, artists: currentTrack.artists, album: currentTrack.album, external_urls: currentTrack.external_urls })
                              toast.success(`Added "${currentTrack.name}" to ${pl.name}`)
                              setPlayerPlaylistOpen(false)
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-foreground hover:bg-accent/50 rounded-lg transition-colors text-left"
                          >
                            <Music className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="truncate">{pl.name}</span>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
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
                  aria-label={isShuffled ? 'Disable shuffle' : 'Enable shuffle'}
                >
                  <Shuffle className="h-4 w-4" />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/5 rounded-full"
                  onClick={previousTrack}
                  disabled={!currentTrack}
                  aria-label="Previous track"
                >
                  <SkipBack className="h-5 w-5" />
                </Button>

                <Button
                  size="icon"
                  className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-primary text-primary-foreground hover:scale-105 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95"
                  onClick={togglePlayPause}
                  disabled={!currentTrack || isLoading}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="h-5 w-5 sm:h-6 sm:w-6 fill-current transition-transform duration-150 scale-100" />
                  ) : (
                    <Play className="h-5 w-5 sm:h-6 sm:w-6 fill-current ml-1 transition-transform duration-150 scale-100" />
                  )}
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/5 rounded-full"
                  onClick={nextTrack}
                  disabled={!currentTrack}
                  aria-label="Next track"
                >
                  <SkipForward className="h-5 w-5" />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  className={`h-8 w-8 text-muted-foreground hover:text-white hover:bg-transparent transition-colors ${repeatMode !== 'off' ? 'text-primary' : ''}`}
                  onClick={toggleRepeat}
                  aria-label={repeatMode === 'off' ? 'Enable repeat' : repeatMode === 'one' ? 'Disable repeat' : 'Repeat one'}
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
                      aria-label="Audio sources"
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
                  className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors disabled:opacity-50"
                  onClick={() => {
                    setIsVideoOpen(true)
                    if (isPlaying) togglePlayPause()
                  }}
                  aria-label={isLoading ? 'Please wait for audio to load' : 'Watch video'}
                  disabled={isLoading}
                >
                  <MonitorPlay className="h-4 w-4" />
                </Button>
              )}

              {/* Lyrics */}
              <Sheet 
                open={lyricsSheetOpen} 
                onOpenChange={(open) => {
                  setLyricsSheetOpen(open)
                  if (open) fetchLyrics()
                }}
              >
                <SheetTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-white hover:bg-white/10 rounded-full"
                    disabled={!currentTrack}
                    aria-label="Lyrics"
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
                        
                        {/* Player Controls in Lyrics Panel */}
                        <div className="mt-6 flex flex-col items-center gap-4 w-full">
                          {/* Control Buttons */}
                          <div className="flex items-center gap-4">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={previousTrack}
                              className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10"
                              aria-label="Previous track"
                            >
                              <SkipBack className="h-5 w-5" />
                            </Button>
                            <Button
                              size="icon"
                              onClick={togglePlayPause}
                              className="p-3 h-auto w-auto rounded-full bg-white text-black hover:scale-105"
                              aria-label={isPlaying ? 'Pause' : 'Play'}
                            >
                              {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={nextTrack}
                              className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10"
                              aria-label="Next track"
                            >
                              <SkipForward className="h-5 w-5" />
                            </Button>
                          </div>
                          
                          {/* Progress Bar */}
                          <div className="w-full flex items-center gap-2">
                            <span className="text-[10px] text-white/50 w-8 text-right">{formatTime(progress)}</span>
                            <Slider
                              value={localProgress}
                              max={100}
                              step={0.1}
                              onValueChange={(value) => {
                                setLocalProgress(value)
                                const newTime = (value[0] / 100) * duration
                                seekTo(newTime)
                              }}
                              className="flex-1"
                            />
                            <span className="text-[10px] text-white/50 w-8">{formatTime(duration)}</span>
                          </div>
                        </div>
                        
                        {/* Saved Lyrics Indicator */}
                        {savedLyricsQuery && (
                          <div className="mt-4 flex items-center justify-center gap-2">
                            <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Save className="h-3 w-3" /> Saved Lyrics
                            </span>
                            <button
                              onClick={clearLyricsPreference}
                              className="text-[10px] text-white/40 hover:text-white/60 underline"
                            >
                              Reset
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Full Lyrics Preview Modal */}
                      {previewLyrics && (
                        <div 
                          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
                          onClick={() => setPreviewLyrics(null)}
                        >
                          <div 
                            className="bg-zinc-900 border border-white/10 rounded-2xl max-w-lg w-full max-h-[80vh] flex flex-col shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Header */}
                            <div className="p-4 border-b border-white/10 flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <h3 className="text-lg font-semibold text-white truncate">{previewLyrics.trackName}</h3>
                                <p className="text-sm text-white/50 truncate">
                                  {previewLyrics.artistName} {previewLyrics.albumName && `• ${previewLyrics.albumName}`}
                                </p>
                                {previewLyrics.syncedLyrics && (
                                  <span className="inline-block mt-1 text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded">Synced Lyrics</span>
                                )}
                              </div>
                              <button
                                onClick={() => setPreviewLyrics(null)}
                                className="p-2 rounded-full text-white/40 hover:text-white hover:bg-white/10 shrink-0"
                              >
                                <X className="h-5 w-5" />
                              </button>
                            </div>

                            {/* Lyrics Content */}
                            <div className="flex-1 overflow-y-auto p-4">
                              <pre className="text-sm text-white/70 whitespace-pre-wrap font-sans leading-relaxed">
                                {(previewLyrics.syncedLyrics || previewLyrics.plainLyrics || 'No lyrics available')
                                  .split('\n')
                                  .map(line => line.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim())
                                  .filter(line => line.length > 0)
                                  .join('\n')}
                              </pre>
                            </div>

                            {/* Actions */}
                            <div className="p-4 border-t border-white/10 flex gap-2">
                              <button
                                onClick={() => { selectLyrics(previewLyrics); setPreviewLyrics(null) }}
                                className="flex-1 py-2 px-4 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
                              >
                                Use These Lyrics
                              </button>
                              <button
                                onClick={() => { saveLyricsPreference(previewLyrics); setPreviewLyrics(null) }}
                                className="flex-1 py-2 px-4 bg-primary hover:bg-primary/80 text-primary-foreground rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                              >
                                <Save className="h-4 w-4" /> Save & Use
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Lyrics Search Toggle */}
                      <button
                        onClick={() => setShowLyricsSearch(!showLyricsSearch)}
                        className="mt-6 flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors"
                      >
                        <Search className="h-4 w-4" />
                        {showLyricsSearch ? 'Hide Search' : 'Search Different Lyrics'}
                      </button>

                      {/* Lyrics Search Panel */}
                      {showLyricsSearch && (
                        <div className="mt-4 w-full max-w-[320px] space-y-3">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={lyricsSearchQuery}
                              onChange={(e) => setLyricsSearchQuery(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && searchLyrics()}
                              placeholder="Search lyrics..."
                              className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-primary"
                            />
                            <button
                              onClick={searchLyrics}
                              disabled={searchingLyrics}
                              className="px-4 py-2 bg-primary hover:bg-primary/80 text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
                            >
                              {searchingLyrics ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                            </button>
                          </div>

                          {/* Search Results */}
                          {lyricsSearchResults.length > 0 && (
                            <div className="max-h-64 overflow-y-auto space-y-2 bg-black/30 rounded-lg p-2">
                              {lyricsSearchResults.map((result) => {
                                // Get preview of lyrics (first 2-3 lines)
                                const lyricsText = result.syncedLyrics || result.plainLyrics || ''
                                const lines = lyricsText
                                  .split('\n')
                                  .map(line => line.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim()) // Remove LRC timestamps
                                  .filter(line => line.length > 0)
                                  .slice(0, 2)
                                const preview = lines.join(' • ')
                                
                                return (
                                  <div
                                    key={result.id}
                                    className="p-3 rounded-lg hover:bg-white/10 cursor-pointer group border border-white/5 hover:border-white/20 transition-all"
                                  >
                                    <div 
                                      className="flex-1"
                                      onClick={() => selectLyrics(result)}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                          <p className="text-sm text-white font-medium truncate">{result.trackName}</p>
                                          <p className="text-[11px] text-white/50 truncate">
                                            {result.artistName} {result.albumName && `• ${result.albumName}`}
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          {result.syncedLyrics && (
                                            <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">
                                              Synced
                                            </span>
                                          )}
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setPreviewLyrics(result) }}
                                            className="p-1.5 rounded-full text-white/40 hover:text-blue-400 hover:bg-blue-500/20 opacity-0 group-hover:opacity-100 transition-all"
                                            title="Preview full lyrics"
                                          >
                                            <Eye className="h-4 w-4" />
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); saveLyricsPreference(result) }}
                                            className="p-1.5 rounded-full text-white/40 hover:text-primary hover:bg-primary/20 opacity-0 group-hover:opacity-100 transition-all"
                                            title="Save as preferred lyrics"
                                          >
                                            <Save className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </div>
                                      {/* Lyrics Preview */}
                                      {preview && (
                                        <p className="mt-2 text-[11px] text-white/40 italic line-clamp-2 bg-white/5 rounded px-2 py-1.5">
                                          "{preview}"
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
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
                    aria-label="Queue"
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
                aria-label="Download"
              >
                <Download className="h-4 w-4" />
              </Button>

              <div className="hidden sm:flex items-center gap-2 group/volume">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-white"
                  onClick={toggleMute}
                  aria-label={volume === 0 ? 'Unmute' : 'Mute'}
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
                    aria-label="Volume"
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
