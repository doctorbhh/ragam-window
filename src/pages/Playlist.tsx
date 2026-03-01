import { useEffect, useState, useMemo, useCallback, memo, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useSpotifyAuth } from '@/context/SpotifyAuthContext'
import { getPlaylist, getAllPlaylistTracks } from '@/services/spotifyservice'
import { SpotifyPlaylist, SpotifyTrack } from '@/types/spotify'
import TrackItem from '@/components/TrackItem'
import { Play, Pause, Clock, Shuffle, Search, X, Plus, Check, Music2, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlayer } from '@/context/PlayerContext'
import { toast } from 'sonner'
import { List } from 'react-window'

// Memoized search input to prevent re-renders
const SearchInput = memo(({ value, onChange, onClear }: { 
  value: string
  onChange: (value: string) => void
  onClear: () => void 
}) => (
  <div className="relative w-72 mr-4">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
    <Input
      type="text"
      placeholder="Search in playlist..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="pl-10 pr-10 bg-secondary/50 border border-border/10 focus:border-primary focus:outline-none rounded-full transition-colors"
    />
    {value && (
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full"
        onClick={onClear}
        aria-label="Clear search"
      >
        <X className="h-4 w-4" />
      </Button>
    )}
  </div>
))

// Isolated player controls component - all usePlayer() calls happen here
// This prevents the parent Playlist component from re-rendering on player state changes
const PlaylistControls = memo(({ 
  tracks, 
  fetchingAllTracks 
}: { 
  tracks: SpotifyTrack[]
  fetchingAllTracks: boolean 
}) => {
  const {
    currentTrack,
    isPlaying,
    playTrack,
    togglePlayPause,
    addManyToQueue,
    clearQueue
  } = usePlayer()

  const isPlaylistPlaying = isPlaying && tracks.some((track) => track.id === currentTrack?.id)

  const handlePlayPause = useCallback(() => {
    if (isPlaylistPlaying) {
      togglePlayPause()
    } else if (tracks.length > 0) {
      playTrack(tracks[0])
      if (tracks.length > 1) {
        addManyToQueue(tracks.slice(1))
      }
    }
  }, [isPlaylistPlaying, tracks, togglePlayPause, playTrack, addManyToQueue])

  const handleShuffle = useCallback(() => {
    if (tracks.length === 0) return

    const shuffled = [...tracks]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    clearQueue()
    playTrack(shuffled[0])

    if (shuffled.length > 1) {
      addManyToQueue(shuffled.slice(1))
    }

    toast.success('Shuffled playlist and added to queue')
  }, [tracks, clearQueue, playTrack, addManyToQueue])

  return (
    <div className="flex items-center gap-4">
      <Button
        onClick={handlePlayPause}
        className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full p-4 h-auto w-auto"
        disabled={tracks.length === 0 || fetchingAllTracks}
        aria-label={isPlaylistPlaying ? 'Pause' : 'Play'}
      >
        {isPlaylistPlaying ? <Pause size={28} /> : <Play size={28} />}
      </Button>
      <Button
        onClick={handleShuffle}
        variant="outline"
        className="rounded-full p-3"
        disabled={tracks.length === 0 || fetchingAllTracks}
        aria-label="Shuffle playlist"
      >
        <Shuffle size={20} />
      </Button>
      {fetchingAllTracks && (
        <span className="text-sm text-muted-foreground">Loading all tracks...</span>
      )}
    </div>
  )
})

// Virtualized row renderer (react-window v2 API)
interface TrackRowProps {
  tracks: SpotifyTrack[]
}

const TrackRow = (props: {
  ariaAttributes: { 'aria-posinset': number; 'aria-setsize': number; role: 'listitem' }
  index: number
  style: React.CSSProperties
} & TrackRowProps): React.ReactElement | null => {
  const { index, style, tracks } = props
  const track = tracks[index]
  if (!track) return null
  return (
    <div style={style}>
      <TrackItem
        track={track}
        index={index}
        showCover={true}
        showAlbum={true}
        showIndex={true}
      />
    </div>
  )
}

const TRACK_ROW_HEIGHT = 56

const Playlist = () => {
  const { playlistId } = useParams<{ playlistId: string }>()
  const [searchParams] = useSearchParams()
  const isYTMusic = searchParams.get('source') === 'ytmusic'
  const { spotifyToken } = useSpotifyAuth()
  const navigate = useNavigate()

  const [playlist, setPlaylist] = useState<SpotifyPlaylist | null>(null)
  const [tracks, setTracks] = useState<SpotifyTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchingAllTracks, setFetchingAllTracks] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Saved to library state
  const [isSaved, setIsSaved] = useState(false)

  // Container ref for measuring virtualized list height
  const listContainerRef = useRef<HTMLDivElement>(null)
  const [listHeight, setListHeight] = useState(600)
  
  // Stable callback references to prevent SearchInput re-renders
  const handleSearchClear = useCallback(() => setSearchQuery(''), [])

  // Measure available height for virtualized list
  useEffect(() => {
    const measure = () => {
      if (listContainerRef.current) {
        const rect = listContainerRef.current.getBoundingClientRect()
        setListHeight(Math.max(300, window.innerHeight - rect.top - 32))
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [loading])

  useEffect(() => {
    if (playlistId) {
      if (playlistId.startsWith('local-')) {
        fetchLocalPlaylist()
      } else if (isYTMusic) {
        fetchYTMusicPlaylist()
      } else if (spotifyToken) {
        fetchPlaylistDetails()
        window.electron.savedPlaylists.check(playlistId).then(setIsSaved).catch(() => {})
      }
    }
  }, [spotifyToken, playlistId, isYTMusic])

  const fetchLocalPlaylist = async () => {
    setLoading(true)
    try {
      // Get playlist metadata
      const allPlaylists = await window.electron.savedPlaylists.getAll()
      const pl = allPlaylists.find((p: any) => p.id === playlistId)
      if (pl) {
        setPlaylist({
          id: pl.id,
          name: pl.name,
          description: pl.description || '',
          images: pl.imageUrl ? [{ url: pl.imageUrl, height: 300, width: 300 }] : [],
          owner: { id: 'local', display_name: 'You' },
          tracks: { total: pl.trackCount || 0 }
        })
        setIsSaved(true)
      }
      // Get tracks from local storage
      const localTracks = await window.electron.playlistTracks.get(playlistId!)
      setTracks(localTracks || [])
    } catch (error) {
      console.error('Error loading local playlist:', error)
      toast.error('Failed to load playlist')
    } finally {
      setLoading(false)
    }
  }

  const fetchYTMusicPlaylist = async () => {
    setLoading(true)
    try {
      // @ts-ignore
      const data = await window.electron.ytmusic.getPlaylist(playlistId!)
      
      const normalizedPlaylist: SpotifyPlaylist = {
        id: data.id || playlistId!,
        name: data.title || 'YouTube Music Playlist',
        description: data.subtitle || '',
        images: data.imageUrl ? [{ url: data.imageUrl, height: 300, width: 300 }] : [],
        owner: { id: 'ytmusic', display_name: 'YouTube Music' },
        tracks: { total: data.trackCount || 0, items: [] }
      }
      setPlaylist(normalizedPlaylist)

      const normalizedTracks: SpotifyTrack[] = (data.tracks || []).map((track: any) => {
        const artists = Array.isArray(track.artists)
          ? track.artists.map((a: any) => ({ id: a.id || '', name: a.name || '' }))
          : typeof track.artists === 'string'
            ? track.artists.split(',').map((name: string) => ({ id: '', name: name.trim() }))
            : [{ id: '', name: 'Unknown' }]

        return {
          id: track.videoId || track.id || Math.random().toString(36),
          name: track.title || '',
          duration_ms: track.durationMs || 0,
          url: '',
          uri: `youtube:${track.videoId}`,
          artists,
          album: {
            id: track.album?.id || '',
            name: track.album?.name || track.albumName || '',
            images: track.imageUrl ? [{ url: track.imageUrl, height: 300, width: 300 }] : [],
            artists
          }
        }
      }).filter((t: SpotifyTrack) => t.id && t.name)

      setTracks(normalizedTracks)
      toast.success(`Loaded ${normalizedTracks.length} tracks`)
    } catch (error) {
      console.error('Error fetching YouTube Music playlist:', error)
      toast.error('Failed to load YouTube Music playlist')
    } finally {
      setLoading(false)
    }
  }

  const fetchPlaylistDetails = async () => {
    setLoading(true)
    try {
      const playlistData = await getPlaylist(spotifyToken!, playlistId!)
      setPlaylist(playlistData)

      setFetchingAllTracks(true)
      toast.info(`Fetching all ${playlistData.tracks.total} tracks...`)

      const allTracks = await getAllPlaylistTracks(spotifyToken!, playlistId!)
      const validTracks = allTracks.filter((track: any) => track && track.id)
      setTracks(validTracks)

      toast.success(`Loaded ${validTracks.length} tracks`)
    } catch (error) {
      console.error('Error fetching playlist:', error)
      toast.error('Failed to load playlist')
    } finally {
      setLoading(false)
      setFetchingAllTracks(false)
    }
  }

  // Filter tracks based on search query
  const filteredTracks = useMemo(() => {
    return searchQuery.trim()
      ? tracks.filter(track => {
          const query = searchQuery.toLowerCase()
          const trackName = track.name?.toLowerCase() || ''
          const artistNames = track.artists?.map(a => a.name.toLowerCase()).join(' ') || ''
          const albumName = track.album?.name?.toLowerCase() || ''
          return trackName.includes(query) || artistNames.includes(query) || albumName.includes(query)
        })
      : tracks
  }, [searchQuery, tracks])

  // Use virtualization only when track count exceeds threshold
  const useVirtualization = filteredTracks.length > 100

  if (loading) {
    return (
      <div>
        <div className="flex items-start gap-6 mb-8 pt-5">
          <Skeleton className="h-32 w-32 sm:h-40 sm:w-40 lg:h-48 lg:w-48 rounded-lg" />
          <div className="flex-1">
            <Skeleton className="h-5 w-20 mb-2" />
            <Skeleton className="h-12 w-64 mb-4" />
            <Skeleton className="h-5 w-48" />
          </div>
        </div>

        <div className="space-y-2 mt-8">
          {Array(10)
            .fill(null)
            .map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
        </div>
      </div>
    )
  }

  if (!playlist) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Music2 className="h-16 w-16 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold text-foreground">Playlist not found</h2>
        <p className="text-sm text-muted-foreground">This playlist may have been removed or the link is invalid.</p>
        <Button onClick={() => navigate('/')} variant="outline" className="mt-2 rounded-full px-6">
          <Home className="h-4 w-4 mr-2" />
          Go Home
        </Button>
      </div>
    )
  }

  return (
    <div>
      <header className="flex items-center gap-6 mb-8 pt-5">
        {/* Responsive cover art (#13) + theme-aware bg (#11) */}
        <div className="h-32 w-32 sm:h-40 sm:w-40 lg:h-48 lg:w-48 bg-card/50 rounded-lg overflow-hidden shadow-lg shrink-0">
          {playlist.images?.[0] && (
            <img
              src={playlist.images[0].url}
              alt={playlist.name}
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div>
          <p className="text-sm uppercase font-medium text-muted-foreground">Playlist</p>
          <h1 className="text-5xl font-bold mt-2 mb-4">{playlist.name}</h1>
          <p className="text-muted-foreground">
            {playlist.description || `${playlist.tracks.total} songs`}
          </p>
          
          {/* Add to Library Button — using shadcn Button (#15) */}
          <Button
            onClick={async () => {
              if (isSaved) return
              try {
                await window.electron.savedPlaylists.add({
                  id: playlist.id,
                  name: playlist.name,
                  description: playlist.description,
                  imageUrl: playlist.images?.[0]?.url,
                  ownerName: playlist.owner?.display_name,
                  trackCount: playlist.tracks?.total
                })
                setIsSaved(true)
                toast.success('Added to Library')
              } catch (e) {
                toast.error('Failed to save playlist')
              }
            }}
            variant={isSaved ? 'ghost' : 'outline'}
            className={`mt-4 rounded-full px-4 ${
              isSaved 
                ? 'bg-primary/20 text-primary cursor-default' 
                : 'bg-white/10 hover:bg-primary text-white hover:text-primary-foreground'
            }`}
          >
            {isSaved ? <><Check className="h-4 w-4 mr-2" /> Added to Library</> : <><Plus className="h-4 w-4 mr-2" /> Add to Library</>}
          </Button>
        </div>
      </header>

      <div className="mt-6 flex items-center justify-between gap-4">
        <PlaylistControls tracks={tracks} fetchingAllTracks={fetchingAllTracks} />

        {/* Search Bar */}
        <SearchInput 
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={handleSearchClear}
        />
      </div>

      <div className="mt-8">
        <div className="grid grid-cols-[16px_4fr_2fr_1fr] gap-4 px-4 py-2 border-b border-border text-sm text-muted-foreground">
          <div className="flex items-center justify-center">#</div>
          <div>Title</div>
          <div>Album</div>
          <div className="flex justify-end">
            <Clock size={16} />
          </div>
        </div>

        {filteredTracks.length > 0 ? (
          <div className="mt-2" ref={listContainerRef}>
            {useVirtualization ? (
              <List<TrackRowProps>
                style={{ height: listHeight }}
                rowCount={filteredTracks.length}
                rowHeight={TRACK_ROW_HEIGHT}
                rowComponent={TrackRow}
                rowProps={{ tracks: filteredTracks } as any}
                overscanCount={10}
              />
            ) : (
              filteredTracks.map((track, index) => (
                <TrackItem
                  key={`${track.id}-${index}`}
                  track={track}
                  index={index}
                  showCover={true}
                  showAlbum={true}
                  showIndex={true}
                />
              ))
            )}
          </div>
        ) : searchQuery ? (
          <div className="text-center py-10">
            <p className="text-xl text-muted-foreground">No songs match "{searchQuery}"</p>
          </div>
        ) : (
          <div className="text-center py-10">
            <p className="text-xl">This playlist is empty</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Playlist
