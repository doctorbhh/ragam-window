import { ChevronLeft, ChevronRight, Settings, LogOut, User as UserIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useState } from 'react'
import { SearchDialog } from './SearchDialog.tsx'
import { useSpotifyAuth } from '@/context/SpotifyAuthContext'
import { useNavigate } from 'react-router-dom'

export function Header() {
  const [searchOpen, setSearchOpen] = useState(false)
  const { user, login, logout } = useSpotifyAuth()
  const navigate = useNavigate()

  return (
    <>
      <header className="sticky top-0 z-40 w-full flex h-16 items-center justify-between px-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        {/* Navigation Controls */}
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full bg-background/50 hover:bg-accent"
            onClick={() => navigate(-1)}
            title="Go Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full bg-background/50 hover:bg-accent"
            onClick={() => navigate(1)}
            title="Go Forward"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-2">
          {/* Settings Button */}
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => navigate('/settings')}
            title="Settings"
          >
            <Settings className="h-5 w-5" />
          </Button>

          {/* User Profile / Login */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9 border border-border/50">
                    <AvatarImage src={user.images?.[0]?.url} alt={user.display_name} />
                    <AvatarFallback className="bg-primary/20 text-primary">
                      {user.display_name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.display_name}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              onClick={login}
              size="sm"
              className="bg-[#1DB954] hover:bg-[#1DB954]/90 text-white font-bold rounded-full px-6"
            >
              Log in
            </Button>
          )}
        </div>
      </header>

      {/* Hidden Search Dialog (Triggered via Sidebar usually, but kept here for context availability) */}
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
