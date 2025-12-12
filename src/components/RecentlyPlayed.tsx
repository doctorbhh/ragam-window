import { Play, Music2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSpotifyAuth } from '@/context/SpotifyAuthContext'
import { Button } from '@/components/ui/button'
import { usePlayer } from '@/context/PlayerContext'

interface RecentlyPlayedProps {
  className?: string
  tracks: any[]
}

export function RecentlyPlayed({ className, tracks }: RecentlyPlayedProps) {
  const { isAuthenticated, login } = useSpotifyAuth()
  const { playTrack } = usePlayer()

  if (!isAuthenticated) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center py-12 px-4 rounded-lg bg-card/60 backdrop-blur',
          className
        )}
      >
        <Music2 className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Connect Spotify to see your music
        </h3>
        <p className="text-sm text-muted-foreground mb-4 text-center">
          Login with your Spotify account to see your recently played tracks
        </p>
        <Button onClick={login} className="bg-[#1DB954] hover:bg-[#1DB954]/90">
          Connect Spotify
        </Button>
      </div>
    )
  }

  if (tracks.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center py-12 px-4 rounded-lg bg-card/60 backdrop-blur',
          className
        )}
      >
        <Music2 className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">No recently played tracks</p>
      </div>
    )
  }

  return (
    <div className={cn('grid grid-cols-2 gap-4 lg:grid-cols-3', className)}>
      {tracks.slice(0, 6).map((item, index) => {
        const track = item.track || item
        const imageUrl = track.album?.images?.[0]?.url
        const artists = track.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist'

        return (
          <div
            key={track.id || index}
            className="group flex cursor-pointer items-center gap-4 overflow-hidden rounded-md bg-card/60 backdrop-blur transition-all hover:bg-card"
          >
            {imageUrl ? (
              <img src={imageUrl} alt={track.name} className="h-16 w-16 rounded object-cover" />
            ) : (
              <div className="h-16 w-16 bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center rounded">
                <Music2 className="h-6 w-6 text-primary" />
              </div>
            )}
            <div className="flex-1 pr-2">
              <p className="text-sm font-semibold text-foreground truncate">{track.name}</p>
              <p className="text-xs text-muted-foreground truncate">{artists}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                playTrack(track)
              }}
              className="mr-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary opacity-0 shadow-glow transition-all hover:scale-105 group-hover:opacity-100"
            >
              <Play className="h-5 w-5 ml-0.5 text-primary-foreground" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
