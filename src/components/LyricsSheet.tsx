import {
  Mic2, Loader2, SkipBack, SkipForward, Play, Pause,
  Search, Save, Eye, X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useState, useEffect, useRef } from 'react'
import {
  LyricLine, LyricsSearchResult,
  createTrackKey, formatTime, parseLRC
} from '@/types/playerTypes'

interface LyricsSheetProps {
  currentTrack: any
  progress: number
  duration: number
  isPlaying: boolean
  seekTo: (time: number) => void
  togglePlayPause: () => void
  previousTrack: () => void
  nextTrack: () => void
}

/**
 * Full-screen lyrics panel with synced lyrics, search, and preference saving.
 *
 * Manages its own state for lyrics data, search, album color extraction,
 * and auto-scroll. Opens as a bottom Sheet overlay.
 */
export function LyricsSheet({
  currentTrack, progress, duration,
  isPlaying, seekTo, togglePlayPause,
  previousTrack, nextTrack
}: LyricsSheetProps) {
  // --- Lyrics data ---
  const [syncedLyrics, setSyncedLyrics] = useState<LyricLine[]>([])
  const [plainLyrics, setPlainLyrics] = useState('')
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1)
  const [loadingLyrics, setLoadingLyrics] = useState(false)
  const activeLyricRef = useRef<HTMLParagraphElement>(null)
  const lyricsContainerRef = useRef<HTMLDivElement>(null)

  // --- Search state ---
  const [lyricsSearchQuery, setLyricsSearchQuery] = useState('')
  const [lyricsSearchResults, setLyricsSearchResults] = useState<LyricsSearchResult[]>([])
  const [searchingLyrics, setSearchingLyrics] = useState(false)
  const [showLyricsSearch, setShowLyricsSearch] = useState(false)
  const [savedLyricsQuery, setSavedLyricsQuery] = useState<string | null>(null)
  const [previewLyrics, setPreviewLyrics] = useState<LyricsSearchResult | null>(null)

  // --- Sheet open state ---
  const [isOpen, setIsOpen] = useState(false)

  // --- Album color ---
  const [albumColor, setAlbumColor] = useState('rgb(20, 20, 20)')
  const [lyricAccentColor, setLyricAccentColor] = useState('rgb(255, 255, 255)')

  // --- Local progress for slider ---
  const [localProgress, setLocalProgress] = useState([0])

  useEffect(() => {
    setLocalProgress([duration > 0 ? (progress / duration) * 100 : 0])
  }, [progress, duration])

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

      canvas.width = 50
      canvas.height = 50
      ctx.drawImage(img, 0, 0, 50, 50)

      try {
        const imageData = ctx.getImageData(0, 0, 50, 50).data
        let r = 0, g = 0, b = 0, count = 0

        for (let i = 0; i < imageData.length; i += 16) {
          r += imageData[i]
          g += imageData[i + 1]
          b += imageData[i + 2]
          count++
        }

        r = Math.floor(r / count)
        g = Math.floor(g / count)
        b = Math.floor(b / count)

        const brightR = Math.min(255, Math.floor(r * 1.5 + 80))
        const brightG = Math.min(255, Math.floor(g * 1.5 + 80))
        const brightB = Math.min(255, Math.floor(b * 1.5 + 80))
        setLyricAccentColor(`rgb(${brightR}, ${brightG}, ${brightB})`)

        r = Math.floor(r * 0.4)
        g = Math.floor(g * 0.4)
        b = Math.floor(b * 0.4)
        setAlbumColor(`rgb(${r}, ${g}, ${b})`)
      } catch {
        setAlbumColor('rgb(20, 20, 20)')
      }
    }
  }, [currentTrack?.album?.images])

  // Clear lyrics when track changes; auto-fetch if sheet is open
  useEffect(() => {
    setSyncedLyrics([])
    setPlainLyrics('')
    setCurrentLyricIndex(-1)
    setSavedLyricsQuery(null)
    setShowLyricsSearch(false)
    setLyricsSearchResults([])

    if (isOpen && currentTrack) {
      const timer = setTimeout(() => fetchLyrics(), 100)
      return () => clearTimeout(timer)
    }
  }, [currentTrack?.id])

  // Highlight the active lyric line based on playback progress
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

  // Auto-scroll to the active lyric
  useEffect(() => {
    if (activeLyricRef.current && lyricsContainerRef.current) {
      const container = lyricsContainerRef.current
      const activeElement = activeLyricRef.current
      const scrollTo = activeElement.offsetTop - (container.clientHeight / 2) + (activeElement.clientHeight / 2)
      container.scrollTo({ top: scrollTo, behavior: 'smooth' })
    }
  }, [currentLyricIndex])

  // --- Lyrics API ---

  const fetchLyrics = async () => {
    if (!currentTrack || loadingLyrics) return
    setLoadingLyrics(true)

    const artistName = currentTrack.artists?.[0]?.name || ''
    const defaultQuery = `${currentTrack.name} ${artistName}`
    setLyricsSearchQuery(defaultQuery)

    const trackKey = createTrackKey(currentTrack)

    try {
      const savedPref = await window.electron.lyricsPref.get(trackKey)
      if (savedPref) {
        setSavedLyricsQuery(savedPref.searchQuery)
        if (savedPref.syncedLyrics) {
          setSyncedLyrics(parseLRC(savedPref.syncedLyrics))
        } else if (savedPref.plainLyrics) {
          setPlainLyrics(savedPref.plainLyrics)
        }
        setLoadingLyrics(false)
        return
      }

      const res = await fetch(
        `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artistName)}&track_name=${encodeURIComponent(currentTrack.name)}`
      )
      if (!res.ok) throw new Error('Lyrics not found')
      const data = await res.json()
      if (data.syncedLyrics) setSyncedLyrics(parseLRC(data.syncedLyrics))
      else if (data.plainLyrics) setPlainLyrics(data.plainLyrics)
      else setPlainLyrics('No lyrics found.')
    } catch {
      setPlainLyrics('Lyrics not available for this song.')
    } finally {
      setLoadingLyrics(false)
    }
  }

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
      setLyricsSearchResults(results.slice(0, 10))
    } catch {
      setLyricsSearchResults([])
    } finally {
      setSearchingLyrics(false)
    }
  }

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

  const saveLyricsPreference = async (result: LyricsSearchResult) => {
    if (!currentTrack) return
    const trackKey = createTrackKey(currentTrack)

    try {
      await window.electron.lyricsPref.set(trackKey, {
        searchQuery: lyricsSearchQuery,
        syncedLyrics: result.syncedLyrics,
        plainLyrics: result.plainLyrics,
        source: 'LRCLIB manual search'
      })
      setSavedLyricsQuery(lyricsSearchQuery)
      selectLyrics(result)
    } catch (e) {
      console.error('Failed to save lyrics preference:', e)
    }
  }

  const clearLyricsPreference = async () => {
    if (!currentTrack) return
    const trackKey = createTrackKey(currentTrack)

    try {
      await window.electron.lyricsPref.delete(trackKey)
      setSavedLyricsQuery(null)
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

  /** Strips LRC timestamps from a line of text */
  const stripTimestamps = (line: string) =>
    line.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim()

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
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

              {/* Player Controls */}
              <div className="mt-6 flex flex-col items-center gap-4 w-full">
                <div className="flex items-center gap-4">
                  <Button size="icon" variant="ghost" onClick={previousTrack} className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10" aria-label="Previous track">
                    <SkipBack className="h-5 w-5" />
                  </Button>
                  <Button size="icon" onClick={togglePlayPause} className="p-3 h-auto w-auto rounded-full bg-white text-black hover:scale-105" aria-label={isPlaying ? 'Pause' : 'Play'}>
                    {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={nextTrack} className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10" aria-label="Next track">
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
                      seekTo((value[0] / 100) * duration)
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
                  <button onClick={clearLyricsPreference} className="text-[10px] text-white/40 hover:text-white/60 underline">
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
                    <button onClick={() => setPreviewLyrics(null)} className="p-2 rounded-full text-white/40 hover:text-white hover:bg-white/10 shrink-0">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <pre className="text-sm text-white/70 whitespace-pre-wrap font-sans leading-relaxed">
                      {(previewLyrics.syncedLyrics || previewLyrics.plainLyrics || 'No lyrics available')
                        .split('\n')
                        .map(stripTimestamps)
                        .filter(line => line.length > 0)
                        .join('\n')}
                    </pre>
                  </div>
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

                {lyricsSearchResults.length > 0 && (
                  <div className="max-h-64 overflow-y-auto space-y-2 bg-black/30 rounded-lg p-2">
                    {lyricsSearchResults.map((result) => {
                      const lyricsText = result.syncedLyrics || result.plainLyrics || ''
                      const preview = lyricsText
                        .split('\n')
                        .map(stripTimestamps)
                        .filter(line => line.length > 0)
                        .slice(0, 2)
                        .join(' • ')

                      return (
                        <div
                          key={result.id}
                          className="p-3 rounded-lg hover:bg-white/10 cursor-pointer group border border-white/5 hover:border-white/20 transition-all"
                        >
                          <div className="flex-1" onClick={() => selectLyrics(result)}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-white font-medium truncate">{result.trackName}</p>
                                <p className="text-[11px] text-white/50 truncate">
                                  {result.artistName} {result.albumName && `• ${result.albumName}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {result.syncedLyrics && (
                                  <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">Synced</span>
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
  )
}
