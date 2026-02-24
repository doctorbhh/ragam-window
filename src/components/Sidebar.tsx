import { useState, useEffect } from 'react'
import { Home, Search, Library, Plus, Heart, Music, Download, WifiOff, History as HistoryIcon } from 'lucide-react'
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
  const { playlists, likedSongs } = useSpotifyPlaylists()
  const { isAuthenticated, isYTMusicAuthenticated } = useSpotifyAuth()
  const [ytPlaylists, setYtPlaylists] = useState<any[]>([])

  useEffect(() => {
    if (isYTMusicAuthenticated) {
      // @ts-ignore
      window.electron.ytmusic.getPlaylists()
        .then((data: any[]) => setYtPlaylists(data))
        .catch((e: any) => console.error('Failed to load YT playlists:', e))
    }
  }, [isYTMusicAuthenticated])

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
                    <div className="flex items-center gap-2 rounded-md p-3 transition-colors hover:bg-sidebar-accent cursor-pointer group">
                      {playlist.images?.[0]?.url ? (
                        <img
                          src={playlist.images[0].url}
                          alt={playlist.name}
                          className="h-12 w-12 rounded object-cover shadow-sm group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded bg-card">
                          <Music className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 overflow-hidden min-w-0">
                        <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                          {playlist.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {playlist.tracks?.total ? `${playlist.tracks.total} tracks` : 'Playlist'}
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

              {/* YouTube Music Playlists */}
              {isYTMusicAuthenticated && ytPlaylists.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-2 px-2 text-xs font-semibold text-muted-foreground tracking-wider uppercase flex items-center gap-2">
                    <HistoryIcon className="h-3 w-3" /> {/* Using History icon as proxy for YT Music logo/playlist icon if generic */}
                    YouTube Music
                  </h3>
                  <div className="space-y-1">
                    {ytPlaylists.map((playlist) => (
                      <Link key={playlist.playlistId || playlist.id} to={`/playlist/${playlist.playlistId || playlist.id}`} className="block">
                        <div className="flex items-center gap-2 rounded-md p-3 transition-colors hover:bg-sidebar-accent cursor-pointer group">
                          {playlist.thumbnails?.[0]?.url ? (
                            <img
                              src={playlist.thumbnails[playlist.thumbnails.length - 1].url}
                              alt={playlist.title}
                              className="h-12 w-12 rounded object-cover shadow-sm group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded bg-card">
                              <Music className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 overflow-hidden min-w-0">
                            <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                              {playlist.title}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {playlist.count || 'Playlist'}
                            </p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
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
