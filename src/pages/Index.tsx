import { useEffect, useState } from 'react'
import { Header } from '@/components/Header.tsx'
import { SongCard } from '@/components/SongCard.tsx'
import { AIRecommendations } from '@/components/AIRecommendations.tsx'
import { getHome } from '@/services/spotifyservice'
import { Music2, Cookie, ExternalLink } from 'lucide-react'
import { useSpotifyAuth } from '@/context/SpotifyAuthContext'
import { useSpotifyPlaylists } from '@/hooks/useSpotifyPlaylists'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const Index = () => {
  const { isAuthenticated, login, loginWithSpDc, user, spotifyToken } = useSpotifyAuth()
  const { playlists, likedSongs } = useSpotifyPlaylists()
  const [greeting, setGreeting] = useState('Good evening')
  const [showSpDcDialog, setShowSpDcDialog] = useState(false)
  const [spDcValue, setSpDcValue] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [homeSections, setHomeSections] = useState<any[]>([])

  useEffect(() => {
    if (isAuthenticated && spotifyToken) {
      getHome(spotifyToken).then(sections => {
        if (sections) setHomeSections(sections)
      }).catch(err => console.error('Failed to load home sections:', err))
    }
  }, [isAuthenticated, spotifyToken])

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) {
      setGreeting('Good morning')
    } else if (hour < 18) {
      setGreeting('Good afternoon')
    } else {
      setGreeting('Good evening')
    }
  }, [])

  const handleSpDcLogin = async () => {
    if (!spDcValue.trim()) return
    
    setIsLoggingIn(true)
    const success = await loginWithSpDc(spDcValue.trim())
    setIsLoggingIn(false)
    
    if (success) {
      setShowSpDcDialog(false)
      setSpDcValue('')
    }
  }

  return (
    <div className="bg-gradient-to-b from-primary/20 to-background min-h-full pb-8">
      <Header />

      <div className="px-8 pb-8 space-y-8">
        {/* Greeting Section */}
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">{greeting}</h1>
          <p className="text-muted-foreground">
            {isAuthenticated && user?.display_name
              ? `Welcome back ${user.display_name}! Here's your personalized music experience.`
              : 'Welcome back! Connect to Spotify to unlock your personalized music experience.'}
          </p>
        </div>

        {/* AI Recommendations */}
        {isAuthenticated && <AIRecommendations />}

        {/* Home/Browse Sections */}
        {isAuthenticated && homeSections.map((section: any) => (
          <div key={section.id || section.title} className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">{section.title}</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {section.items.map((item: any) => {
                if (item.type !== 'playlist') return null // Only show playlists for now
                return (
                  <SongCard
                    key={item.id}
                    title={item.name}
                    artist={item.description || item.owner?.display_name || ''}
                    imageUrl={item.images?.[0]?.url}
                    playlistId={item.id}
                  />
                )
              })}
            </div>
          </div>
        ))}

        {/* Liked Songs Preview */}
        {isAuthenticated && likedSongs.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">Your Liked Songs</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {likedSongs.slice(0, 8).map((item) => {
                const track = item.track
                return (
                  <SongCard
                    key={track.id}
                    title={track.name}
                    artist={track.artists?.map((a: any) => a.name).join(', ')}
                    imageUrl={track.album?.images?.[0]?.url}
                    track={track}
                  />
                )
              })}
            </div>
          </div>
        )}

        {/* Playlists Preview */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-foreground">
            {isAuthenticated ? 'Your Playlists' : 'Connect to Spotify'}
          </h2>

          {isAuthenticated ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {playlists.slice(0, 8).map((playlist) => (
                <SongCard
                  key={playlist.id}
                  title={playlist.name}
                  artist={`${playlist.tracks?.total || 0} tracks`}
                  imageUrl={playlist.images?.[0]?.url}
                  playlistId={playlist.id}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-4 rounded-lg bg-card/60 backdrop-blur border border-border/50">
              <Music2 className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">Your music awaits</h3>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
                Connect your Spotify account to see your playlists, recently played tracks, and get
                personalized recommendations.
              </p>
              <div className="flex flex-col gap-3 items-center">
                <Button
                  onClick={login}
                  size="lg"
                  className="bg-[#1DB954] hover:bg-[#1DB954]/90 text-white font-bold"
                >
                  Connect with Spotify
                </Button>
                <span className="text-xs text-muted-foreground">or</span>
                <Button
                  onClick={() => setShowSpDcDialog(true)}
                  variant="outline"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Cookie className="h-4 w-4 mr-2" />
                  Login with Cookie (No Rate Limits)
                </Button>
                <p className="text-xs text-muted-foreground text-center max-w-xs">
                  Use sp_dc cookie from your browser if you get rate limit errors
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* sp_dc Cookie Input Dialog */}
      <Dialog open={showSpDcDialog} onOpenChange={setShowSpDcDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cookie className="h-5 w-5" />
              Login with sp_dc Cookie
            </DialogTitle>
            <DialogDescription className="text-left space-y-2">
              <p>This method avoids Spotify's rate limits.</p>
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium">How to get your sp_dc cookie:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Open <span className="font-mono text-xs">open.spotify.com</span> in your browser</li>
                  <li>Login to Spotify</li>
                  <li>Press <kbd className="px-1 py-0.5 bg-background rounded text-xs">F12</kbd> → Application → Cookies</li>
                  <li>Find <span className="font-mono text-xs">sp_dc</span> and copy its value</li>
                </ol>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Input
              placeholder="Paste your sp_dc cookie value here..."
              value={spDcValue}
              onChange={(e) => setSpDcValue(e.target.value)}
              className="font-mono text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleSpDcLogin()}
            />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => window.open('https://open.spotify.com', '_blank')}
              className="sm:flex-1"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Spotify
            </Button>
            <Button
              onClick={handleSpDcLogin}
              disabled={!spDcValue.trim() || isLoggingIn}
              className="bg-[#1DB954] hover:bg-[#1DB954]/90 text-white sm:flex-1"
            >
              {isLoggingIn ? 'Logging in...' : 'Login'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Index
