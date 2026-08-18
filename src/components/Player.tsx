import {
  Play, Pause, SkipBack, SkipForward,
  Repeat, Repeat1, Shuffle,
  Volume2, VolumeX,
  Loader2, Download, MonitorPlay
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useState, useEffect } from 'react'
import { usePlayer } from '@/context/PlayerContext'
import { formatTime } from '@/types/playerTypes'

import VideoModal from '@/components/VideoModal'
import { WaveformSeekBar } from '@/components/WaveformSeekBar'
import { LyricsSheet } from '@/components/LyricsSheet'
import { QueuePopover } from '@/components/QueuePopover'
import { SourceSwitcher } from '@/components/SourceSwitcher'
import { AddToPlaylistPopover } from '@/components/AddToPlaylistPopover'

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

  const [localProgress, setLocalProgress] = useState([0])
  const [localVolume, setLocalVolume] = useState([volume * 100])
  const [isVideoOpen, setIsVideoOpen] = useState(false)

  // Sync local progress/volume with player state
  useEffect(() => {
    setLocalProgress([duration > 0 ? (progress / duration) * 100 : 0])
  }, [progress, duration])

  useEffect(() => {
    setLocalVolume([volume * 100])
  }, [volume])

  // --- EVENT HANDLERS ---

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

  // --- RENDER ---

  const isRagamTheme =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('theme-ragam')

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
          {/* Progress Bar / Waveform — conditional on theme */}
          {isRagamTheme ? (
            <WaveformSeekBar
              barWidth={2}
              barGap={1}
              maxBarHeight={14}
              minBarHeight={2}
              progress={localProgress[0]}
              duration={duration}
              currentTime={progress}
              trackSeed={currentTrack?.name || 'default'}
              isPlaying={isPlaying}
              onSeek={handleProgressChange}
            />
          ) : (
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
          )}

          <div className="flex h-20 sm:h-24 items-center justify-between px-4 sm:px-6 pt-2">
            {/* LEFT: Track Info */}
            <div className="flex w-[30%] min-w-0 items-center gap-4">
              {currentTrack ? (
                <>
                  <div className="relative group shrink-0">
                    <div className="absolute inset-0 bg-primary/20 blur-md rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    {currentTrack.album?.images?.[0]?.url ? (
                      <img
                        src={currentTrack.album.images[0].url}
                        alt="Album Art"
                        className="relative h-12 w-12 sm:h-14 sm:w-14 rounded-lg object-cover shadow-lg border border-white/5"
                      />
                    ) : (
                      <div className="relative h-12 w-12 sm:h-14 sm:w-14 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center">
                        <span className="text-white/30 text-lg">♪</span>
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col justify-center overflow-hidden">
                    <p className="truncate text-sm font-semibold text-white/90 hover:text-white transition-colors cursor-pointer">
                      {currentTrack.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground hover:text-white/70 transition-colors cursor-pointer">
                      {currentTrack.artists?.map((a: any) => a.name).join(', ')}
                    </p>
                  </div>
                  <AddToPlaylistPopover currentTrack={currentTrack} />
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
                <SourceSwitcher
                  alternatives={alternatives}
                  savedSourceId={savedSourceId}
                  onChangeSource={changeSource}
                  onClearPreference={clearSourcePreference}
                />
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
              <LyricsSheet
                currentTrack={currentTrack}
                progress={progress}
                duration={duration}
                isPlaying={isPlaying}
                seekTo={seekTo}
                togglePlayPause={togglePlayPause}
                previousTrack={previousTrack}
                nextTrack={nextTrack}
              />

              {/* Queue */}
              <QueuePopover
                queue={queue}
                currentTrack={currentTrack}
                isPlaying={isPlaying}
                onPlayTrack={playTrack}
                onClearQueue={clearQueue}
              />

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
