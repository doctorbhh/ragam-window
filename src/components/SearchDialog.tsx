import { useState, useEffect } from 'react'
import { Search, Play, Clock } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSpotifySearch } from '@/hooks/useSpotifySearch'
import { Button } from '@/components/ui/button'
import { useSpotifyAuth } from '@/context/SpotifyAuthContext'
import { usePlayer } from '@/context/PlayerContext'

interface SearchDialogProps {
  open: boolean
  onClose: () => void
}

export function SearchDialog({ open, onClose }: SearchDialogProps) {
  const [query, setQuery] = useState('')
  const { search, searching, searchResults } = useSpotifySearch()
  const { isAuthenticated } = useSpotifyAuth()
  const { playTrack } = usePlayer()

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (query && isAuthenticated) {
        search(query)
      }
    }, 300)

    return () => clearTimeout(debounceTimer)
  }, [query, isAuthenticated])

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
  }

  const handlePlayTrack = async (track: any) => {
    await playTrack(track)
    onClose() // Close search dialog after playing
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Search Music</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={
              isAuthenticated ? 'Search for songs, artists, or albums...' : 'Please login to search'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
            disabled={!isAuthenticated}
          />
        </div>

        {!isAuthenticated && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Please login with Spotify to search for music</p>
          </div>
        )}

        {isAuthenticated && (
          <ScrollArea className="h-[400px]">
            {searching && (
              <div className="text-center py-8">
                <div className="h-8 w-8 border-t-2 border-primary rounded-full animate-spin mx-auto mb-2" />
                <p className="text-muted-foreground">Searching...</p>
              </div>
            )}

            {!searching && searchResults.length === 0 && query && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No results found for "{query}"</p>
              </div>
            )}

            {!searching && searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((track: any) => (
                  <div
                    key={track.id}
                    className="group flex items-center gap-3 rounded-lg p-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="h-12 w-12 rounded bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center relative overflow-hidden">
                      {track.album?.images?.[0]?.url ? (
                        <img
                          src={track.album.images[0].url}
                          alt={track.album.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Play className="h-5 w-5 text-primary" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{track.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {track.artists?.map((a: any) => a.name).join(', ')}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDuration(track.duration_ms)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handlePlayTrack(track)}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
