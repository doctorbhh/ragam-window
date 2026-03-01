import { useState } from 'react'
import { Play, Plus, Music } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SpotifyTrack } from '@/types/spotify'
import { usePlayer } from '@/context/PlayerContext'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from 'sonner'

interface TrackItemProps {
  track: SpotifyTrack
  index: number
  showCover?: boolean
  showAlbum?: boolean
  showIndex?: boolean
}

export default function TrackItem({
  track,
  index,
  showCover = false,
  showAlbum = false,
  showIndex = false
}: TrackItemProps) {
  const { playTrack, currentTrack } = usePlayer()
  const isCurrentTrack = currentTrack?.id === track.id
  const [savedPlaylists, setSavedPlaylists] = useState<any[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [showNameInput, setShowNameInput] = useState(false)
  const [newName, setNewName] = useState('')

  const formatDuration = (ms: number | undefined | null) => {
    if (!ms || isNaN(ms)) return '0:00'
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
  }

  const handlePlay = () => {
    playTrack(track)
  }

  const loadPlaylists = async () => {
    try {
      const saved = await window.electron.savedPlaylists.getAll()
      // Only show local/user-created playlists
      setSavedPlaylists((saved || []).filter((p: any) => p.id?.startsWith('local-')))
    } catch {
      setSavedPlaylists([])
    }
  }

  const addToPlaylist = async (playlistId: string, playlistName: string) => {
    try {
      // Build a minimal track object for storage
      const trackData = {
        id: track.id,
        name: track.name,
        uri: track.uri,
        duration_ms: track.duration_ms,
        artists: track.artists,
        album: track.album
      }
      await window.electron.playlistTracks.add(playlistId, trackData)
      toast.success(`Added "${track.name}" to ${playlistName}`)
    } catch {
      toast.error('Failed to add to playlist')
    }
    setAddOpen(false)
  }

  const createNewPlaylistWithSong = async () => {
    const name = newName.trim() || `My Playlist ${new Date().toLocaleDateString()}`
    try {
      const newId = `local-${Date.now()}`
      await window.electron.savedPlaylists.add({
        id: newId,
        name,
        description: '',
        imageUrl: track.album?.images?.[0]?.url,
        trackCount: 1
      })
      // Add the track to the new playlist
      const trackData = {
        id: track.id,
        name: track.name,
        uri: track.uri,
        duration_ms: track.duration_ms,
        artists: track.artists,
        album: track.album
      }
      await window.electron.playlistTracks.add(newId, trackData)
      toast.success(`Created "${name}" with "${track.name}"`)
    } catch {
      toast.error('Failed to create playlist')
    }
    setNewName('')
    setShowNameInput(false)
    setAddOpen(false)
  }

  return (
    <div
      className={`group flex items-center gap-4 px-4 py-2 hover:bg-accent/50 rounded-md transition-colors ${isCurrentTrack ? 'bg-accent/50' : ''}`}
    >
      {showIndex && (
        <div className="w-4 text-center text-sm text-muted-foreground font-medium">{index + 1}</div>
      )}

      {showCover && (
        <div className="h-10 w-10 rounded overflow-hidden bg-muted flex-shrink-0">
          {track.album?.images?.[0]?.url ? (
            <img
              src={track.album.images[0].url}
              alt={track.album.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-primary/20" />
          )}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p
          className={`font-medium truncate ${isCurrentTrack ? 'text-primary' : 'text-foreground'}`}
        >
          {track.name}
        </p>
        <p className="text-sm text-muted-foreground truncate">
          {track.artists?.map((a) => a.name).join(', ')}
        </p>
      </div>

      {showAlbum && (
        <div className="flex-1 min-w-0 hidden md:block">
          <p className="text-sm text-muted-foreground truncate">{track.album?.name}</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Add to Playlist button */}
        <Popover open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) { setShowNameInput(false); setNewName('') } }}>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); loadPlaylists() }}
              aria-label="Add to playlist"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-56 p-0 bg-popover border border-border/10 shadow-xl rounded-xl"
            align="end"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 border-b border-border/10">
              <p className="text-xs font-semibold text-foreground px-1">Add to Playlist</p>
            </div>
            <div className="p-1 max-h-48 overflow-y-auto">
              {showNameInput ? (
                <div className="px-2 py-1.5">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Playlist name..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') createNewPlaylistWithSong() }}
                    className="w-full bg-accent/50 border border-border/20 rounded-lg px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <div className="flex gap-1 mt-1">
                    <Button size="sm" variant="ghost" className="h-6 text-xs flex-1" onClick={() => { setShowNameInput(false); setNewName('') }}>Cancel</Button>
                    <Button size="sm" className="h-6 text-xs flex-1" onClick={createNewPlaylistWithSong}>Create</Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNameInput(true)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-foreground hover:bg-accent/50 rounded-lg transition-colors text-left"
                >
                  <Plus className="h-3.5 w-3.5 text-primary" />
                  New Playlist
                </button>
              )}
              {savedPlaylists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => addToPlaylist(pl.id, pl.name)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-foreground hover:bg-accent/50 rounded-lg transition-colors text-left"
                >
                  <Music className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{pl.name}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <span className="text-sm text-muted-foreground w-10 text-right">
          {formatDuration(track.duration_ms)}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className={`h-8 w-8 rounded-full ${isCurrentTrack ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
          onClick={handlePlay}
          aria-label="Play"
        >
          <Play className={`h-4 w-4 ${isCurrentTrack ? 'fill-primary text-primary' : ''}`} />
        </Button>
      </div>
    </div>
  )
}