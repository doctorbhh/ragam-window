import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/Header.tsx'
import { SongCard } from '@/components/SongCard.tsx'

import { getHome } from '@/services/spotifyservice'
import { Music2, LogOut } from 'lucide-react'
import { useSpotifyAuth } from '@/context/SpotifyAuthContext.tsx'
import { useSpotifyPlaylists } from '@/hooks/useSpotifyPlaylists'
import { Button } from '@/components/ui/button'
import SetupScreen from '@/components/SetupScreen'

const Index = () => {
  const {
    isAuthenticated, login, user, spotifyToken,
    isYTMusicAuthenticated, ytmusicLogin, ytmusicLogout
  } = useSpotifyAuth()
  const { playlists, likedSongs } = useSpotifyPlaylists()
  const [greeting, setGreeting] = useState('Good evening')
  const [isYTMusicLoggingIn, setIsYTMusicLoggingIn] = useState(false)
  const [homeSections, setHomeSections] = useState<any[]>([])
  const [ytmusicHome, setYtmusicHome] = useState<any[]>([])
  const [ytmusicPlaylists, setYtmusicPlaylists] = useState<any[]>([])
  const [ytmusicVisibleSections, setYtmusicVisibleSections] = useState(6)

  const anyAuthenticated = isAuthenticated || isYTMusicAuthenticated

  useEffect(() => {
    if (isAuthenticated && spotifyToken) {
      getHome(spotifyToken).then(sections => {
        if (sections) setHomeSections(sections)
      }).catch(err => console.error('Failed to load home sections:', err))
    }
  }, [isAuthenticated, spotifyToken])

  const fetchYTMusicHome = useCallback(() => {
    if (!isYTMusicAuthenticated) return
    // @ts-ignore
    window.electron.ytmusic.getHome().then((data: any) => {
      if (Array.isArray(data)) {
        setYtmusicHome(data)
      } else {
        console.warn('[Index] YTMusic home data not an array:', data)
        setYtmusicHome([])
      }
    }).catch((err: any) => console.error('Failed to load YouTube Music home:', err))
  }, [isYTMusicAuthenticated])

  useEffect(() => {
    if (isYTMusicAuthenticated) {
      fetchYTMusicHome()

      // @ts-ignore
      window.electron.ytmusic.getPlaylists().then((data: any) => {
        if (Array.isArray(data)) {
          setYtmusicPlaylists(data)
        } else {
          setYtmusicPlaylists([])
        }
      }).catch((err: any) => console.error('Failed to load YouTube Music playlists:', err))
    }
  }, [isYTMusicAuthenticated])

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

  const handleYTMusicLogin = async () => {
    setIsYTMusicLoggingIn(true)
    try {
      await ytmusicLogin()
    } catch (error) {
      console.error('YouTube Music login failed:', error)
    } finally {
      setIsYTMusicLoggingIn(false)
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
            {anyAuthenticated && user?.display_name
              ? `Welcome back ${user.display_name}! Here's your personalized music experience.`
              : anyAuthenticated
                ? "You're connected! Explore your music library."
                : 'Welcome back! Connect to Spotify or YouTube Music to unlock your personalized music experience.'}
          </p>
        </div>

        {/* AI Recommendations */}

        {/* Spotify Home/Browse Sections */}
        {isAuthenticated && homeSections.map((section: any) => (
          <div key={section.id || section.title} className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">{section.title}</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {section.items.map((item: any) => {
                if (item.type !== 'playlist') return null
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

        {/* YouTube Music Browse Sections */}
        {isYTMusicAuthenticated && ytmusicHome.length > 0 && (
          <div className="flex items-center gap-3 mt-2">
            <h2 className="text-2xl font-bold text-foreground">Browse</h2>
            <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded">YouTube Music</span>
            <Button
              onClick={ytmusicLogout}
              variant="ghost"
              size="sm"
              className="ml-auto text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4 mr-1" />
              Logout YT Music
            </Button>
          </div>
        )}

        {isYTMusicAuthenticated && ytmusicHome.slice(0, ytmusicVisibleSections).map((section: any) => (
          <div key={section.id} className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">
              {section.title}
              <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded ml-2">YT Music</span>
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {(section.items || section.contents || []).slice(0, 8).map((item: any, i: number) => {

                // Songs — playable tracks (also pass playlistId if available for Quick Picks)
                if (item.type === 'song' && item.videoId) {
                  return (
                    <SongCard
                      key={item.videoId || i}
                      title={item.title}
                      artist={item.artists?.map((a: any) => a.name).join(', ') || item.subtitle}
                      imageUrl={item.imageUrl}
                      playlistId={item.playlistId || undefined}
                      source={item.playlistId ? 'ytmusic' : undefined}
                      track={{
                        id: item.videoId,
                        name: item.title,
                        duration_ms: item.durationMs || 0,
                        uri: `youtube:${item.videoId}`,
                        artists: item.artists?.length ? item.artists.map((a: any) => ({ id: a.id || '', name: a.name })) : [{ id: '', name: item.subtitle }],
                        album: {
                          id: item.album?.id || '',
                          name: item.album?.name || '',
                          images: [{ url: item.imageUrl, height: 300, width: 300 }],
                          artists: item.artists?.length ? item.artists.map((a: any) => ({ id: a.id || '', name: a.name })) : [{ id: '', name: item.subtitle }]
                        }
                      }}
                    />
                  )
                }

                // Everything else (playlist, album, artist, unknown) — navigate as playlist
                const resolvedPlaylistId = item.playlistId || item.browseId?.replace('VL', '') || ''
                return (
                  <SongCard
                    key={resolvedPlaylistId || item.browseId || i}
                    title={item.title}
                    artist={item.artists?.map((a: any) => a.name).join(', ') || item.subtitle}
                    imageUrl={item.imageUrl}
                    playlistId={resolvedPlaylistId || undefined}
                    source={resolvedPlaylistId ? 'ytmusic' : undefined}
                  />
                )
              })}
            </div>
          </div>
        ))}

        {/* Show More / Show Less for YT Music Sections */}
        {isYTMusicAuthenticated && ytmusicHome.length > 6 && (
          <div className="flex justify-center">
            <Button
              onClick={() => setYtmusicVisibleSections(prev => 
                prev >= ytmusicHome.length ? 6 : Math.min(prev + 6, ytmusicHome.length)
              )}
              variant="outline"
              className="px-8"
            >
              {ytmusicVisibleSections >= ytmusicHome.length
                ? 'Show Less'
                : `Show More (${ytmusicHome.length - ytmusicVisibleSections} more sections)`}
            </Button>
          </div>
        )}

        {/* YouTube Music User Playlists */}
        {isYTMusicAuthenticated && ytmusicPlaylists.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">Your YouTube Music Playlists</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {ytmusicPlaylists.slice(0, 8).map((pl: any, i: number) => {
                const resolvedId = pl.playlistId || pl.browseId?.replace('VL', '') || pl.id || ''
                return (
                <SongCard
                  key={resolvedId || i}
                  title={pl.title || ''}
                  artist={pl.description || pl.subtitle || ''}
                  imageUrl={pl.imageUrl || ''}
                  playlistId={resolvedId || undefined}
                  source="ytmusic"
                />
                )
              })}
            </div>
          </div>
        )}

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
            {isAuthenticated ? 'Your Playlists' : ''}
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
          ) : !anyAuthenticated ? (
            <SetupScreen 
              onSpotifyLogin={login} 
              onYTMusicLogin={handleYTMusicLogin} 
              isYTMusicLoggingIn={isYTMusicLoggingIn} 
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default Index
