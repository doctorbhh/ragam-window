import { Play, Music2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import { usePlayer } from '@/context/PlayerContext'
import { SpotifyTrack } from '@/types/spotify'

interface SongCardProps {
  title: string
  artist: string
  imageUrl?: string
  imageGradient?: string
  className?: string
  onClick?: () => void
  playlistId?: string
  track?: SpotifyTrack
}

export function SongCard({
  title,
  artist,
  imageUrl,
  imageGradient = 'bg-gradient-primary',
  className,
  onClick,
  playlistId,
  track
}: SongCardProps) {
  const navigate = useNavigate()
  const { playTrack } = usePlayer()

  const handleClick = () => {
    if (onClick) {
      onClick()
    } else if (playlistId) {
      navigate(`/playlist/${playlistId}`)
    }
  }

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (track) {
      await playTrack(track)
    }
  }

  return (
    <div
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-lg bg-card p-4 transition-all hover:bg-accent/50',
        className
      )}
      onClick={handleClick}
    >
      {imageUrl ? (
        <div className="relative aspect-square w-full mb-4 overflow-hidden rounded-md shadow-lg">
          <img
            src={imageUrl}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      ) : (
        <div
          className={cn(
            'mb-4 aspect-square rounded-md shadow-lg flex items-center justify-center',
            imageGradient
          )}
        >
          <Music2 className="h-12 w-12 text-white/60" />
        </div>
      )}

      <div className="space-y-1">
        <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
        <p className="truncate text-xs text-muted-foreground">{artist}</p>
      </div>

      {/* Play Button Overlay */}
      <Button
        size="icon"
        onClick={handlePlay}
        className="absolute bottom-4 right-4 h-12 w-12 rounded-full bg-[#1DB954] text-black shadow-xl opacity-0 translate-y-4 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-[-8px] hover:scale-105 hover:bg-[#1ed760]"
      >
        <Play className="h-6 w-6 fill-current ml-1" />
      </Button>
    </div>
  )
}
