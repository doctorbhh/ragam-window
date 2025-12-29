import { useState, useEffect } from 'react'
import { Search, Play, Music2, Youtube, Disc, ChevronDown, ChevronUp, Loader2, ListMusic, User, LayoutGrid } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSpotifySearch, SearchType } from '@/hooks/useSpotifySearch'
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
  const [searchType, setSearchType] = useState<SearchType>('all')
  
  const [youtubeResults, setYoutubeResults] = useState<any[]>([])
  const [youtubeSearching, setYoutubeSearching] = useState(false)
  
  // Album expansion state
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null)
  const [albumTracks, setAlbumTracks] = useState<any[]>([])
  const [loadingAlbumTracks, setLoadingAlbumTracks] = useState(false)

  const { search, searching, searchResults, albumResults, artistResults, playlistResults } = useSpotifySearch()
  const { isAuthenticated, spotifyToken } = useSpotifyAuth()
  const { playTrack, addManyToQueue } = usePlayer()

  // Spotify search
  useEffect(() => {
    if (searchSource !== 'spotify') return
    const debounceTimer = setTimeout(() => {
      if (query && isAuthenticated) {
        search(query, searchType)
        setExpandedAlbumId(null)
        setAlbumTracks([])
      }
    }, 300)
    return () => clearTimeout(debounceTimer)
  }, [query, isAuthenticated, searchSource, searchType])

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
  const artists = searchSource === 'spotify' ? artistResults : []
  const playlists = searchSource === 'spotify' ? playlistResults : []
  const canSearch = searchSource === 'youtube' || isAuthenticated

  const chips: { label: string; value: SearchType }[] = [
    { label: 'All', value: 'all' },
    { label: 'Tracks', value: 'tracks' },
    { label: 'Albums', value: 'albums' },
    { label: 'Artists', value: 'artists' },
    { label: 'Playlists', value: 'playlists' }
  ]

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 flex-shrink-0 border-b border-border/50">
          <div className="flex items-center justify-between mb-4">
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
          
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={canSearch ? `Search ${searchSource === 'spotify' ? 'Spotify' : 'YouTube'}...` : 'Please login'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
              disabled={!canSearch}
            />
          </div>

          {searchSource === 'spotify' && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {chips.map(chip => (
                <button
                  key={chip.value}
                  onClick={() => setSearchType(chip.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                    searchType === chip.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {canSearch ? (
            <ScrollArea className="h-full px-6">
              {isSearching ? (
                <div className="text-center py-20">
                  <div className="h-8 w-8 border-t-2 border-primary rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-muted-foreground">Searching...</p>
                </div>
              ) : (
                <div className="py-6 space-y-8">
                  {/* Empty State */}
                  {!isSearching && (results?.length || 0) === 0 && (albums?.length || 0) === 0 && (artists?.length || 0) === 0 && (playlists?.length || 0) === 0 && query && (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No results for "{query}"</p>
                    </div>
                  )}

                  {/* Artists Section */}
                  {(searchType === 'all' || searchType === 'artists') && (artists?.length || 0) > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Artists
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">
                        {artists!.slice(0, searchType === 'all' ? 5 : undefined).map((artist: any) => (
                          <div key={artist.id} className="group cursor-pointer text-center space-y-2">
                             <div className="aspect-square rounded-full overflow-hidden bg-secondary relative shadow-lg">
                               <img src={artist.images?.[0]?.url} alt={artist.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                             </div>
                             <p className="font-medium text-sm truncate">{artist.name}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Albums Section */}
                  {(searchType === 'all' || searchType === 'albums') && (albums?.length || 0) > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                        <Disc className="h-4 w-4" />
                        Albums
                      </h3>
                      <div className="space-y-1">
                        {albums!.slice(0, searchType === 'all' ? 5 : undefined).map((album: any) => (
                          <div key={album.id}>
                            <div
                              className="group flex items-center gap-3 rounded-lg p-2 hover:bg-accent/50 transition-colors cursor-pointer"
                              onClick={() => handleExpandAlbum(album.id)}
                            >
                              <div className="h-12 w-12 rounded-md overflow-hidden shrink-0 shadow-sm">
                                <img src={album.images?.[0]?.url} alt={album.name} className="h-full w-full object-cover" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">{album.name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {album.artists?.map((a: any) => a.name).join(', ')} • {album.release_date?.split('-')[0]}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 rounded-full bg-primary/10 hover:bg-primary/20 text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => { e.stopPropagation(); handlePlayAlbum(album) }}
                                >
                                  <Play className="h-4 w-4 fill-current" />
                                </Button>
                                {expandedAlbumId === album.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4 opacity-0 group-hover:opacity-100" />}
                              </div>
                            </div>
                            
                            {/* Expanded Album Tracks */}
                            {expandedAlbumId === album.id && (
                              <div className="ml-4 pl-4 border-l border-border/50 space-y-1 py-2 my-1">
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
                                      <span className="text-xs text-muted-foreground w-5 text-right font-mono">{idx + 1}</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm truncate">{track.name}</p>
                                        <p className="text-xs text-muted-foreground truncate">
                                          {track.artists?.map((a: any) => a.name).join(', ')}
                                        </p>
                                      </div>
                                      <span className="text-xs text-muted-foreground">{formatDuration(track.duration_ms)}</span>
                                      <Play className="h-3 w-3 opacity-0 group-hover:opacity-100 text-primary ml-2" />
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

                  {/* Playlists Section */}
                  {(searchType === 'all' || searchType === 'playlists') && (playlists?.length || 0) > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                        <ListMusic className="h-4 w-4" />
                        Playlists
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {playlists!.slice(0, searchType === 'all' ? 4 : undefined).map((playlist: any) => (
                          <div key={playlist.id} className="group cursor-pointer space-y-2">
                             <div className="aspect-square rounded-md overflow-hidden bg-secondary relative shadow-md">
                               <img src={playlist.images?.[0]?.url} alt={playlist.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                               <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Play className="h-8 w-8 text-white fill-white" />
                               </div>
                             </div>
                             <div>
                               <p className="font-medium text-sm truncate">{playlist.name}</p>
                               <p className="text-xs text-muted-foreground truncate">By {playlist.owner?.display_name}</p>
                             </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Songs Section */}
                  {(searchType === 'all' || searchType === 'tracks') && (results?.length || 0) > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                        <Music2 className="h-4 w-4" />
                        Songs
                      </h3>
                      <div className="space-y-1">
                        {results!.map((track: any, idx: number) => (
                          <div
                            key={track.id || idx}
                            className="group flex items-center gap-3 rounded-lg p-2 hover:bg-accent/50 transition-colors cursor-pointer"
                            onClick={() => handlePlayTrack(track)}
                          >
                            <div className="h-10 w-10 rounded-md overflow-hidden shrink-0 relative shadow-sm">
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
                              <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">{track.name || track.title}</p>
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
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground bg-muted/20">
              <LayoutGrid className="h-12 w-12 mb-4 opacity-20" />
              <p>Please login to search on Spotify</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}


