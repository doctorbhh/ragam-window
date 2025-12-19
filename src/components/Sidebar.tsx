import { useState, useEffect } from 'react'
import { Home, Search, Library, Plus, Heart, Music, Download, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useSpotifyAuth } from '@/context/SpotifyAuthContext'
import { useSpotifyPlaylists } from '@/hooks/useSpotifyPlaylists'
import { SearchDialog } from '../components/SearchDialog.tsx'
import { Link } from 'react-router-dom'

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const { isAuthenticated } = useSpotifyAuth()
  const { playlists, likedSongs } = useSpotifyPlaylists()

  // --- SHORTCUT: Press 'K' to Search ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      // Ignore if typing in an input
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      if (e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <div className={cn('flex h-full flex-col gap-2', className)}>
        <div className="rounded-lg bg-sidebar p-4">
          <div className="space-y-1">
            <Link to="/" className="w-full">
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-sidebar-foreground hover:text-foreground"
              >
                <Home className="h-5 w-5" />
                Home
              </Button>
            </Link>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-sidebar-foreground hover:text-foreground"
              onClick={() => setSearchOpen(true)}
              title="Search (Press 'K')"
            >
              <Search className="h-5 w-5" />
              Search
            </Button>

            <Link to="/downloads" className="w-full block">
              <Button
                variant="ghost"
                className="w-full justify-start gap-3  text-sidebar-foreground hover:text-foreground"
              >
                <Download className="h-5 w-5" />
                Downloads
              </Button>
            </Link>

            <Link to="/offline" className="w-full block">
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-sidebar-foreground hover:text-foreground"
              >
                <WifiOff className="h-5 w-5" />
                Offline
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex-1 rounded-lg bg-sidebar">
          <div className="flex items-center justify-between p-4">
            <div className="space-y-1 w-full">
              <Link to="/library" className="w-full block">
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 p-0 text-sidebar-foreground hover:text-foreground"
                >
                  <Library className="h-5 w-5" />
                  Your Library
                </Button>
              </Link>
            </div>

            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-sidebar-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="h-[calc(100%-120px)] px-2">
            <div className="space-y-1 p-2">
              {isAuthenticated && likedSongs.length > 0 && (
                <Link to="/liked-songs" className="block">
                  <div className="mb-2 flex items-center gap-2 rounded-md bg-gradient-card p-3 transition-colors hover:bg-sidebar-accent cursor-pointer">
                    <div className="flex h-12 w-12 items-center justify-center rounded bg-gradient-primary">
                      <Heart className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Liked Songs</p>
                      <p className="text-xs text-muted-foreground">
                        Playlist • {likedSongs.length} songs
                      </p>
                    </div>
                  </div>
                </Link>
              )}

              {isAuthenticated ? (
                playlists.map((playlist) => (
                  <Link key={playlist.id} to={`/playlist/${playlist.id}`} className="block">
                    <div className="flex items-center gap-2 rounded-md p-3 transition-colors hover:bg-sidebar-accent cursor-pointer">
                      {playlist.images?.[0]?.url ? (
                        <img
                          src={playlist.images[0].url}
                          alt={playlist.name}
                          className="h-12 w-12 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded bg-card">
                          <Music className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-medium text-foreground truncate">
                          {playlist.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {playlist.tracks?.total || 0} tracks
                        </p>
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">Login to see your playlists</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
