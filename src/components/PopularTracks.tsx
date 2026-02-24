import { Play, Pause, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePlayer } from '@/context/PlayerContext'
import { cn } from '@/lib/utils'

interface Track {
  id: string
  name: string
  artists: Array<{ name: string }>
  album?: {
    images?: Array<{ url: string }>
  }
  duration_ms: number
  uri?: string
}

interface PopularTracksProps {
  tracks?: Track[]
  title?: string
}

export function PopularTracks({ tracks = [], title = 'Popular' }: PopularTracksProps) {
  const { currentTrack, isPlaying, playTrack, togglePlayPause } = usePlayer()

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleTrackClick = (track: Track) => {
    if (currentTrack?.id === track.id) {
      togglePlayPause()
    } else {
      // Convert to SpotifyTrack format (ensure artists have IDs)
      const spotifyTrack = {
        ...track,
        artists: track.artists.map(a => ({
          ...a,
          id: 'id' in a ? (a as any).id : 'unknown'
        }))
      }
      playTrack(spotifyTrack as any)
    }
  }

  const getYear = (track: Track) => {
    // In real implementation, get from release date
    return '2012'
  }

  // If no tracks provided, show sample data
  const displayTracks = tracks.length > 0 ? tracks.slice(0, 6) : [
    {
      id: '1',
      name: 'Sabotage',
      artists: [{ name: 'Bebe Rexha' }],
      album: { images: [{ url: '' }] },
      duration_ms: 275000
    },
    {
      id: '2',
      name: 'Superstar (Copa America...)',
      artists: [{ name: 'Pitbul' }, { name: 'Becky G' }],
      album: { images: [{ url: '' }] },
      duration_ms: 214000
    },
    {
      id: '3',
      name: 'Smells Like Teen Spirit',
      artists: [{ name: 'Nirvana' }],
      album: { images: [{ url: '' }] },
      duration_ms: 275000
    },
    {
      id: '4',
      name: 'Billie Jean',
      artists: [{ name: 'Michael Jackson' }],
      album: { images: [{ url: '' }] },
      duration_ms: 275000
    },
    {
      id: '5',
      name: "Stayin' Alive",
      artists: [{ name: 'Bee Gees' }],
      album: { images: [{ url: '' }] },
      duration_ms: 275000
    },
    {
      id: '6',
      name: 'I Will Survive',
      artists: [{ name: 'Gloria Gaynor' }],
      album: { images: [{ url: '' }] },
      duration_ms: 275000
    }
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">{title}</h2>
        <Button variant="link" className="text-muted-foreground hover:text-foreground">
          See All
        </Button>
      </div>

      {/* Tracks Table */}
      <div className="rounded-lg overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[40px_50px_1fr_1fr_80px_60px] gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border/50">
          <div>#</div>
          <div></div>
          <div>Title</div>
          <div>Artists</div>
          <div>Year</div>
          <div className="text-right">Time</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-border/30">
          {displayTracks.map((track, index) => {
            const isCurrentTrack = currentTrack?.id === track.id
            const isCurrentlyPlaying = isCurrentTrack && isPlaying

            return (
              <div
                key={track.id}
                className={cn(
                  'track-row grid grid-cols-[40px_50px_1fr_1fr_80px_60px] gap-4 px-4 py-3 cursor-pointer group',
                  isCurrentTrack && 'playing'
                )}
                onClick={() => handleTrackClick(track)}
              >
                {/* Index / Play Button */}
                <div className="flex items-center justify-center">
                  <span className={cn(
                    "text-sm group-hover:hidden",
                    isCurrentTrack ? "text-primary" : "text-muted-foreground"
                  )}>
                    {index + 1}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="hidden group-hover:flex h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleTrackClick(track)
                    }}
                  >
                    {isCurrentlyPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Album Cover */}
                <div className="flex items-center">
                  {track.album?.images?.[0]?.url ? (
                    <img
                      src={track.album.images[0].url}
                      alt={track.name}
                      className="w-10 h-10 rounded object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                      {index === 1 && <TrendingUp className="h-4 w-4 text-primary" />}
                    </div>
                  )}
                </div>

                {/* Title */}
                <div className="flex items-center min-w-0">
                  <span className={cn(
                    "text-sm font-medium truncate",
                    isCurrentTrack ? "text-primary" : "text-foreground"
                  )}>
                    {track.name}
                  </span>
                </div>

                {/* Artists */}
                <div className="flex items-center min-w-0">
                  <span className="text-sm text-muted-foreground truncate">
                    {track.artists.map((a) => a.name).join(', ')}
                  </span>
                </div>

                {/* Year */}
                <div className="flex items-center">
                  <span className="text-sm text-muted-foreground">{getYear(track)}</span>
                </div>

                {/* Duration */}
                <div className="flex items-center justify-end">
                  <span className="text-sm text-muted-foreground">
                    {formatTime(track.duration_ms)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
