import { useState, useEffect } from 'react'
import { Search, Play, Clock, Music2, Youtube, Disc, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSpotifySearch } from '@/hooks/useSpotifySearch'
import { Button } from '@/components/ui/button'
import { useSpotifyAuth } from '@/context/SpotifyAuthContext'
import { usePlayer } from '@/context/PlayerContext'
import { searchYouTubeVideo } from '@/services/youtubeService'
import { getAlbum } from '@/services/spotifyservice'

interface SearchDialogProps {
  open: boolean
  onClose: () => void
}

type SearchSource = 'spotify' | 'youtube'

export function SearchDialog({ open, onClose }: SearchDialogProps) {
  const [query, setQuery] = useState('')
  const [searchSource, setSearchSource] = useState<SearchSource>('spotify')
  const [youtubeResults, setYoutubeResults] = useState<any[]>([])
  const [youtubeSearching, setYoutubeSearching] = useState(false)
  
  // Album expansion state
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null)
  const [albumTracks, setAlbumTracks] = useState<any[]>([])
  const [loadingAlbumTracks, setLoadingAlbumTracks] = useState(false)

  const { search, searching, searchResults, albumResults } = useSpotifySearch()
  const { isAuthenticated, spotifyToken } = useSpotifyAuth()
  const { playTrack, addManyToQueue } = usePlayer()
  
  // Debug album results
  console.log('[SearchDialog] albumResults:', albumResults?.length, albumResults)

  // Spotify search
  useEffect(() => {
    if (searchSource !== 'spotify') return
    const debounceTimer = setTimeout(() => {
      if (query && isAuthenticated) {
        search(query)
        setExpandedAlbumId(null)
        setAlbumTracks([])
      }
    }, 300)
    return () => clearTimeout(debounceTimer)
  }, [query, isAuthenticated, searchSource])

  // YouTube search
  useEffect(() => {
    if (searchSource !== 'youtube') return
    const debounceTimer = setTimeout(async () => {
      if (query) {
        setYoutubeSearching(true)
        try {
          const results = await searchYouTubeVideo(query)
          setYoutubeResults(results)
        } catch (e) {
          console.error('YouTube search failed:', e)
          setYoutubeResults([])
        } finally {
          setYoutubeSearching(false)
        }
      } else {
        setYoutubeResults([])
      }
    }, 300)
    return () => clearTimeout(debounceTimer)
  }, [query, searchSource])

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
  }

  const handlePlayTrack = async (track: any, albumInfo?: any) => {
    // For YouTube results, convert to SpotifyTrack-like object
    if (searchSource === 'youtube') {
      const ytTrack = {
        id: track.id,
        name: track.title,
        artists: [{ id: track.id, name: track.channelTitle || 'Unknown' }],
        album: {
          id: track.id,
          name: track.title,
          images: [{ url: track.thumbnail }]
        },
        duration_ms: 0
      }
      await playTrack(ytTrack as any)
    } else if (albumInfo) {
      // Track from album - needs album info
      const fullTrack = {
        ...track,
        album: albumInfo
      }
      await playTrack(fullTrack)
    } else {
      await playTrack(track)
    }
    onClose()
  }

  const handleExpandAlbum = async (albumId: string) => {
    if (expandedAlbumId === albumId) {
      setExpandedAlbumId(null)
      setAlbumTracks([])
      return
    }

    setExpandedAlbumId(albumId)
    setLoadingAlbumTracks(true)
    
    try {
      if (!spotifyToken) return
      const albumData = await getAlbum(spotifyToken, albumId)
      setAlbumTracks(albumData.tracks?.items || [])
    } catch (e) {
      console.error('Failed to load album tracks:', e)
      setAlbumTracks([])
    } finally {
      setLoadingAlbumTracks(false)
    }
  }

  const handlePlayAlbum = async (album: any) => {
    if (!spotifyToken) return
    
    try {
      const albumData = await getAlbum(spotifyToken, album.id)
      const tracks = albumData.tracks?.items?.map((t: any) => ({
        ...t,
        album: {
          id: album.id,
          name: album.name,
          images: album.images
        }
      })) || []
      
      if (tracks.length > 0) {
        await playTrack(tracks[0])
        if (tracks.length > 1) {
          addManyToQueue(tracks.slice(1))
        }
      }
      onClose()
    } catch (e) {
      console.error('Failed to play album:', e)
    }
  }

  const isSearching = searchSource === 'spotify' ? searching : youtubeSearching
  const results = searchSource === 'spotify' ? searchResults : youtubeResults
  const albums = searchSource === 'spotify' ? albumResults : []
  const canSearch = searchSource === 'youtube' || isAuthenticated

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Search Music</DialogTitle>
            <div className="flex items-center gap-2 bg-secondary/50 rounded-full p-1">
              <button
                onClick={() => setSearchSource('spotify')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  searchSource === 'spotify'
                    ? 'bg-[#1DB954] text-white shadow-md'
                    : 'text-muted-foreground hover:text-white'
                }`}
              >
                <Music2 className="h-4 w-4" />
                Spotify
              </button>
              <button
                onClick={() => setSearchSource('youtube')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  searchSource === 'youtube'
                    ? 'bg-[#FF0000] text-white shadow-md'
                    : 'text-muted-foreground hover:text-white'
                }`}
              >
                <Youtube className="h-4 w-4" />
                YouTube
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={canSearch ? `Search ${searchSource === 'spotify' ? 'Spotify' : 'YouTube'}...` : 'Please login'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
            disabled={!canSearch}
          />
        </div>

        {canSearch && (
          <ScrollArea className="h-[450px]">
            {isSearching && (
              <div className="text-center py-8">
                <div className="h-8 w-8 border-t-2 border-primary rounded-full animate-spin mx-auto mb-2" />
                <p className="text-muted-foreground">Searching...</p>
              </div>
            )}

            {!isSearching && (results?.length || 0) === 0 && (albums?.length || 0) === 0 && query && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No results for "{query}"</p>
              </div>
            )}

            {!isSearching && (
              <div className="space-y-4">
                {/* Albums Section */}
                {(albums?.length || 0) > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-2 flex items-center gap-2">
                      <Disc className="h-3 w-3" />
                      Albums
                    </h3>
                    <div className="space-y-1">
                      {albums.slice(0, 5).map((album: any) => (
                        <div key={album.id}>
                          <div
                            className="group flex items-center gap-3 rounded-lg p-2 hover:bg-accent/50 transition-colors cursor-pointer"
                            onClick={() => handleExpandAlbum(album.id)}
                          >
                            <div className="h-12 w-12 rounded-md overflow-hidden shrink-0">
                              <img src={album.images?.[0]?.url} alt={album.name} className="h-full w-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{album.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {album.artists?.map((a: any) => a.name).join(', ')} • {album.total_tracks} tracks
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 rounded-full bg-primary/10 hover:bg-primary/20 text-primary"
                                onClick={(e) => { e.stopPropagation(); handlePlayAlbum(album) }}
                              >
                                <Play className="h-4 w-4 fill-current" />
                              </Button>
                              {expandedAlbumId === album.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </div>
                          </div>
                          
                          {/* Expanded Album Tracks */}
                          {expandedAlbumId === album.id && (
                            <div className="ml-4 pl-4 border-l border-border/50 space-y-1 py-2">
                              {loadingAlbumTracks ? (
                                <div className="flex items-center gap-2 py-4 text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span className="text-sm">Loading tracks...</span>
                                </div>
                              ) : (
                                albumTracks.map((track: any, idx: number) => (
                                  <div
                                    key={track.id}
                                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/30 cursor-pointer group"
                                    onClick={() => handlePlayTrack(track, { id: album.id, name: album.name, images: album.images })}
                                  >
                                    <span className="text-xs text-muted-foreground w-5 text-right">{idx + 1}</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm truncate">{track.name}</p>
                                      <p className="text-xs text-muted-foreground truncate">
                                        {track.artists?.map((a: any) => a.name).join(', ')}
                                      </p>
                                    </div>
                                    <span className="text-xs text-muted-foreground">{formatDuration(track.duration_ms)}</span>
                                    <Play className="h-4 w-4 opacity-0 group-hover:opacity-100 text-primary" />
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Songs Section */}
                {(results?.length || 0) > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-2 flex items-center gap-2">
                      <Music2 className="h-3 w-3" />
                      Songs
                    </h3>
                    <div className="space-y-1">
                      {results.map((track: any, idx: number) => (
                        <div
                          key={track.id || idx}
                          className="group flex items-center gap-3 rounded-lg p-2 hover:bg-accent/50 transition-colors cursor-pointer"
                          onClick={() => handlePlayTrack(track)}
                        >
                          <div className="h-10 w-10 rounded-md overflow-hidden shrink-0 relative">
                            <img
                              src={track.album?.images?.[0]?.url || track.thumbnail}
                              alt={track.album?.name || track.title}
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Play className="h-4 w-4 text-white fill-white" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{track.name || track.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {track.artists?.map((a: any) => a.name).join(', ') || track.channelTitle}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {track.duration_ms > 0 && (
                              <span className="text-xs text-muted-foreground hidden sm:block">{formatDuration(track.duration_ms)}</span>
                            )}
                            {searchSource === 'youtube' && (
                              <span className="text-[9px] bg-red-500/20 text-red-400 px-1 py-0.5 rounded font-medium">YT</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}


