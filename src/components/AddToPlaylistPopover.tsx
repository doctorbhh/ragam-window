import { Plus, Music } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useState } from 'react'
import { toast } from 'sonner'

interface AddToPlaylistPopoverProps {
  currentTrack: any
}

/**
 * Popover allowing the user to add the current track to a local playlist
 * or create a new playlist on the fly.
 */
export function AddToPlaylistPopover({ currentTrack }: AddToPlaylistPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [playlists, setPlaylists] = useState<any[]>([])
  const [showNameInput, setShowNameInput] = useState(false)
  const [newName, setNewName] = useState('')

  const loadPlaylists = async () => {
    try {
      const saved = await window.electron.savedPlaylists.getAll()
      setPlaylists((saved || []).filter((p: any) => p.id?.startsWith('local-')))
    } catch {
      setPlaylists([])
    }
  }

  const createPlaylistWithTrack = async () => {
    if (!currentTrack) return
    const name = newName.trim() || `My Playlist ${new Date().toLocaleDateString()}`
    const newId = `local-${Date.now()}`

    await window.electron.savedPlaylists.add({
      id: newId,
      name,
      description: '',
      imageUrl: currentTrack.album?.images?.[0]?.url,
      trackCount: 1
    })
    await window.electron.playlistTracks.add(newId, {
      id: currentTrack.id,
      name: currentTrack.name,
      uri: currentTrack.uri,
      duration_ms: currentTrack.duration_ms,
      artists: currentTrack.artists,
      album: currentTrack.album
    })

    toast.success(`Created "${name}" with "${currentTrack.name}"`)
    resetAndClose()
  }

  const addToExistingPlaylist = async (playlist: any) => {
    if (!currentTrack) return
    await window.electron.playlistTracks.add(playlist.id, {
      id: currentTrack.id,
      name: currentTrack.name,
      uri: currentTrack.uri,
      duration_ms: currentTrack.duration_ms,
      artists: currentTrack.artists,
      album: currentTrack.album
    })
    toast.success(`Added "${currentTrack.name}" to ${playlist.name}`)
    setIsOpen(false)
  }

  const resetAndClose = () => {
    setNewName('')
    setShowNameInput(false)
    setIsOpen(false)
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) {
          setShowNameInput(false)
          setNewName('')
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="hidden sm:flex h-9 w-9 shrink-0 hover:bg-white/10 rounded-full transition-colors text-muted-foreground"
          onClick={loadPlaylists}
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
          {showNameInput ? (
            <div className="px-2 py-1.5">
              <input
                autoFocus
                type="text"
                placeholder="Playlist name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createPlaylistWithTrack()
                }}
                className="w-full bg-accent/50 border border-border/20 rounded-lg px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex gap-1 mt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs flex-1"
                  onClick={() => { setShowNameInput(false); setNewName('') }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-6 text-xs flex-1"
                  onClick={createPlaylistWithTrack}
                >
                  Create
                </Button>
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
          {playlists.map((pl: any) => (
            <button
              key={pl.id}
              onClick={() => addToExistingPlaylist(pl)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-foreground hover:bg-accent/50 rounded-lg transition-colors text-left"
            >
              <Music className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate">{pl.name}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
