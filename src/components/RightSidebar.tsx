import { useState } from 'react'
import { ChevronDown, MoreHorizontal, Bell, Music } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useSpotifyAuth } from '@/context/SpotifyAuthContext'
import { useSpotifyPlaylists } from '@/hooks/useSpotifyPlaylists'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Link } from 'react-router-dom'

interface RightSidebarProps {
  className?: string
}

// Sample data for top picks (in real app, this would come from API)
const topPicks = [
  { id: 1, title: 'Show Me How', artist: 'Boyz II Men', color: 'bg-red-500' },
  { id: 2, title: 'Why Do You Love Me', artist: 'Def Leppard', color: 'bg-orange-500' },
  { id: 3, title: 'Can I Call You Tonight?', artist: 'The Flamingos', color: 'bg-yellow-500' },
  { id: 4, title: "It's My Life", artist: 'Amadou and Mariam', color: 'bg-green-500' }
]

// Sample notifications
const notifications = [
  { id: 1, type: 'playlist', title: 'Playlist Added', subtitle: '200 songs', icon: '≡' },
  { id: 2, type: 'new', title: 'New music', subtitle: 'Beat It - Michael Jackson', icon: '♪' },
  { id: 3, type: 'shared', title: 'Playlist Shared', subtitle: 'To 8 users', icon: '↗' }
]

export function RightSidebar({ className }: RightSidebarProps) {
  const { user, logout } = useSpotifyAuth()
  const { playlists } = useSpotifyPlaylists()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  // Get recent playlists (max 6)
  const recentPlaylists = playlists.slice(0, 6)

  return (
    <ScrollArea className={cn('flex flex-col p-4', className)}>
      {/* User Profile Section */}
      <div className="mb-6">
        <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between h-auto p-3 rounded-xl bg-card/50 hover:bg-card"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 border border-border/50">
                  <AvatarImage src={user?.images?.[0]?.url} alt={user?.display_name} />
                  <AvatarFallback className="bg-primary/20 text-primary">
                    {user?.display_name?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-foreground">
                  {user?.display_name || 'Guest User'}
                </span>
              </div>
              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                isDropdownOpen && "rotate-180"
              )} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={logout} className="text-destructive">
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Today's Top Picks */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Today's Top Picks</h3>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          {topPicks.map((pick) => (
            <div
              key={pick.id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", pick.color)}>
                <Music className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{pick.title}</p>
                <p className="text-xs text-muted-foreground truncate">{pick.artist}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Notifications */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
        </div>
        <div className="space-y-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground">
                {notification.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{notification.title}</p>
                <p className="text-xs text-muted-foreground">{notification.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Playlists */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Recent Playlists</h3>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {recentPlaylists.length > 0 ? (
            recentPlaylists.map((playlist) => (
              <Link
                key={playlist.id}
                to={`/playlist/${playlist.id}`}
                className="aspect-square rounded-lg overflow-hidden right-sidebar-card"
              >
                {playlist.images?.[0]?.url ? (
                  <img
                    src={playlist.images[0].url}
                    alt={playlist.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-muted/50 flex items-center justify-center">
                    <Music className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </Link>
            ))
          ) : (
            // Placeholder squares when no playlists
            [...Array(6)].map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-lg bg-gradient-to-br from-muted/40 to-muted/20"
              />
            ))
          )}
        </div>
      </div>
    </ScrollArea>
  )
}
