import { useEffect, useState, useMemo, useCallback, memo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useSpotifyAuth } from '@/context/SpotifyAuthContext'
import { getPlaylist, getAllPlaylistTracks } from '@/services/spotifyservice'
import { SpotifyPlaylist, SpotifyTrack } from '@/types/spotify'
import TrackItem from '@/components/TrackItem'
import { Play, Pause, Clock, Shuffle, Search, X, Plus, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlayer } from '@/context/PlayerContext'
import { toast } from 'sonner'

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
      className="pl-10 pr-10 bg-secondary/50 border border-white/10 focus:border-primary focus:outline-none rounded-full transition-colors"
    />
    {value && (
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full"
        onClick={onClear}
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
      >
        {isPlaylistPlaying ? <Pause size={28} /> : <Play size={28} />}
      </Button>
      <Button
        onClick={handleShuffle}
        variant="outline"
        className="rounded-full p-3"
        disabled={tracks.length === 0 || fetchingAllTracks}
        title="Shuffle playlist"
      >
        <Shuffle size={20} />
      </Button>
      {fetchingAllTracks && (
        <span className="text-sm text-muted-foreground">Loading all tracks...</span>
      )}
    </div>
  )
})

const Playlist = () => {
  const { playlistId } = useParams<{ playlistId: string }>()
  const [searchParams] = useSearchParams()
  const isYTMusic = searchParams.get('source') === 'ytmusic'
  const { spotifyToken } = useSpotifyAuth()

  const [playlist, setPlaylist] = useState<SpotifyPlaylist | null>(null)
  const [tracks, setTracks] = useState<SpotifyTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchingAllTracks, setFetchingAllTracks] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Saved to library state
  const [isSaved, setIsSaved] = useState(false)
  
  // Stable callback references to prevent SearchInput re-renders
  const handleSearchClear = useCallback(() => setSearchQuery(''), [])

  useEffect(() => {
    if (playlistId) {
      if (isYTMusic) {
        fetchYTMusicPlaylist()
      } else if (spotifyToken) {
        fetchPlaylistDetails()
        window.electron.savedPlaylists.check(playlistId).then(setIsSaved).catch(() => {})
      }
    }
  }, [spotifyToken, playlistId, isYTMusic])

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

  if (loading) {
    return (
      <div>
        <div className="flex items-start gap-6 mb-8 pt-5">
          <Skeleton className="h-44 w-44 rounded-lg" />
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
    return <div className="text-center py-10">Playlist not found</div>
  }

  return (
    <div>
      <header className="flex items-center gap-6 mb-8 pt-5">
        <div className="h-44 w-44 bg-gray-800/50 rounded-lg overflow-hidden shadow-lg">
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
          
          {/* Add to Library Button */}
          <button
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
            className={`mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              isSaved 
                ? 'bg-primary/20 text-primary cursor-default' 
                : 'bg-white/10 hover:bg-primary text-white hover:text-primary-foreground'
            }`}
          >
            {isSaved ? <><Check className="h-4 w-4" /> Added to Library</> : <><Plus className="h-4 w-4" /> Add to Library</>}
          </button>
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
          <div className="mt-2">
            {filteredTracks.map((track, index) => (
              <TrackItem
                key={`${track.id}-${index}`}
                track={track}
                index={index}
                showCover={true}
                showAlbum={true}
                showIndex={true}
              />
            ))}
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
