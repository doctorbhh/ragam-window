import { useRef, useState, useEffect, useMemo, MouseEvent } from 'react'
import { formatTime } from '@/types/playerTypes'

interface WaveformSeekBarProps {
  barWidth: number
  barGap: number
  maxBarHeight: number   // max HALF-height (total bar = 2x this)
  minBarHeight: number   // min HALF-height
  progress: number       // 0-100
  duration: number
  currentTime: number
  trackSeed: string
  isPlaying: boolean
  onSeek: (value: number[]) => void
}

/**
 * A Ragam-themed waveform seek bar.
 *
 * Renders pseudo-random mirrored bars seeded from the track name.
 * Bar count adapts to container width via ResizeObserver.
 *
 * Math: N = floor(W / (w + g)), seekPercent = (clickedIndex / N) * 100
 */
export function WaveformSeekBar({
  barWidth, barGap, maxBarHeight, minBarHeight,
  progress, duration, currentTime, trackSeed,
  isPlaying, onSeek
}: WaveformSeekBarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [barCount, setBarCount] = useState(0)

  // Recalculate bar count when container resizes
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const recalculate = () => {
      const containerWidth = container.clientWidth
      setBarCount(Math.floor(containerWidth / (barWidth + barGap)))
    }

    recalculate()
    const observer = new ResizeObserver(recalculate)
    observer.observe(container)
    return () => observer.disconnect()
  }, [barWidth, barGap])

  // Generate pseudo-random half-heights seeded from track name
  const barHeights = useMemo(() => {
    if (barCount <= 0) return []
    const heights: number[] = []
    let hash = 0
    for (let c = 0; c < trackSeed.length; c++) {
      hash = ((hash << 5) - hash) + trackSeed.charCodeAt(c)
      hash |= 0
    }
    const range = maxBarHeight - minBarHeight
    for (let i = 0; i < barCount; i++) {
      hash = ((hash << 5) - hash) + i
      hash |= 0
      heights.push(minBarHeight + Math.abs(hash % range))
    }
    return heights
  }, [barCount, trackSeed, minBarHeight, maxBarHeight])

  const playedCount = barCount > 0 ? Math.floor((progress / 100) * barCount) : 0

  const getBarColor = (index: number): string => {
    const ratio = index / barCount
    if (ratio < 0.4) return 'waveform-played-pink'
    if (ratio < 0.7) return 'waveform-played-purple'
    return 'waveform-played-blue'
  }

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickedIndex = Math.floor((e.clientX - rect.left) / (barWidth + barGap))
    const clampedIndex = Math.max(0, Math.min(clickedIndex, barCount - 1))
    onSeek([(clampedIndex / barCount) * 100])
  }

  return (
    <div className="w-full flex items-center gap-3 px-4 sm:px-6 pt-1 pb-0">
      <span className="text-[10px] text-muted-foreground font-mono w-8 text-right shrink-0">
        {formatTime(currentTime)}
      </span>
      <div
        ref={containerRef}
        className="flex-1 flex items-center cursor-pointer"
        style={{ gap: `${barGap}px`, height: `${maxBarHeight * 2 + 4}px` }}
        onClick={handleClick}
      >
        {barHeights.map((halfHeight, i) => {
          const isPlayed = i < playedCount
          const isPlayhead = i === playedCount
          const totalHeight = halfHeight * 2
          const colorClass = isPlayed ? getBarColor(i) : 'waveform-unplayed'

          let animClass = ''
          let animDelay: string | undefined
          if (isPlaying) {
            if (isPlayhead) {
              animClass = 'waveform-bar-playhead'
            } else if (isPlayed) {
              animClass = 'waveform-bar-played'
              animDelay = `${(i % 20) * 0.06}s`
            }
          }

          return (
            <div
              key={i}
              className={`waveform-bar ${colorClass} ${animClass}`}
              style={{
                height: `${totalHeight}px`,
                width: `${barWidth}px`,
                flexShrink: 0,
                animationDelay: animDelay,
              }}
            />
          )
        })}
      </div>
      <span className="text-[10px] text-muted-foreground font-mono w-8 shrink-0">
        {formatTime(duration)}
      </span>
    </div>
  )
}
