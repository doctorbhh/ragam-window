import { useState, useEffect } from 'react'
import { WifiOff, Play, Trash2, Music, Clock, HardDrive, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  listCachedSongs,
  getCachedAudio,
  deleteCachedAudio,
  clearCache,
  getCacheStats,
  CachedSong,
  CacheStats
} from '@/services/cacheService'
import { usePlayer } from '@/context/PlayerContext'
import { SpotifyTrack } from '@/types/spotify'

const Offline = () => {
  const [cachedSongs, setCachedSongs] = useState<CachedSong[]>([])
  const [cacheStats, setCacheStats] = useState<CacheStats>({ count: 0, sizeBytes: 0, sizeMB: 0 })
  const [loading, setLoading] = useState(true)
  const [playingKey, setPlayingKey] = useState<string | null>(null)
  const { playTrack, currentTrack, isPlaying } = usePlayer()

  useEffect(() => {
    loadCachedSongs()
  }, [])

  const loadCachedSongs = async () => {
    setLoading(true)
    try {
      const [songs, stats] = await Promise.all([listCachedSongs(), getCacheStats()])
      // Sort by most recently cached
      songs.sort((a, b) => b.cachedAt - a.cachedAt)
      setCachedSongs(songs)
      setCacheStats(stats)
    } catch (e) {
      console.error('Failed to load cached songs:', e)
      toast.error('Failed to load offline songs')
    } finally {
      setLoading(false)
    }
  }

  const handlePlayCached = async (song: CachedSong) => {
    setPlayingKey(song.key)
    try {
      const cachedUrl = await getCachedAudio(song.key)
      if (!cachedUrl) {
        toast.error('Cached file not found')
        return
      }

      // Create a SpotifyTrack-like object for the player
      const track: SpotifyTrack = {
        id: song.trackId || song.key,
        name: song.trackName || 'Unknown Track',
        artists: [{ id: song.trackId || 'offline', name: song.artistName || 'Unknown Artist' }],
        album: {
          id: 'offline',
          name: 'Offline',
          images: [],
          artists: [{ id: 'offline', name: song.artistName || 'Unknown Artist' }]
        },
        duration_ms: 0,
        url: cachedUrl // Pre-set the URL so player uses it directly
      }

      await playTrack(track)
    } catch (e) {
      console.error('Failed to play cached song:', e)
      toast.error('Failed to play offline song')
    } finally {
      setPlayingKey(null)
    }
  }

  const handleDeleteSong = async (song: CachedSong) => {
    try {
      await deleteCachedAudio(song.key)
      setCachedSongs((prev) => prev.filter((s) => s.key !== song.key))
      const stats = await getCacheStats()
      setCacheStats(stats)
      toast.success('Song removed from offline')
    } catch (e) {
      toast.error('Failed to remove song')
    }
  }

  const handleClearAll = async () => {
    try {
      await clearCache()
      setCachedSongs([])
      setCacheStats({ count: 0, sizeBytes: 0, sizeMB: 0 })
      toast.success('All offline songs cleared')
    } catch (e) {
      toast.error('Failed to clear offline songs')
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="p-6 pb-24 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <WifiOff className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Offline</h1>
            <p className="text-sm text-muted-foreground">
              {cacheStats.count} songs • {cacheStats.sizeMB} MB
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={loadCachedSongs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          {cachedSongs.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear All Offline Songs?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete {cachedSongs.length} cached songs ({cacheStats.sizeMB} MB).
                    Songs will need to be re-downloaded when played again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearAll}>Clear All</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : cachedSongs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <WifiOff className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg">No offline songs yet</p>
          <p className="text-sm">Play songs while online to cache them for offline playback</p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="space-y-2">
            {cachedSongs.map((song) => {
              const isCurrentlyPlaying =
                currentTrack?.id === song.trackId || currentTrack?.id === song.key
              const isLoadingThis = playingKey === song.key

              return (
                <div
                  key={song.key}
                  className={`group flex items-center gap-4 p-3 rounded-lg transition-colors hover:bg-card/80 ${
                    isCurrentlyPlaying ? 'bg-primary/10' : 'bg-card/50'
                  }`}
                >
                  {/* Play Button / Music Icon */}
                  <button
                    onClick={() => handlePlayCached(song)}
                    disabled={isLoadingThis}
                    className="relative h-12 w-12 rounded bg-secondary shrink-0 flex items-center justify-center group-hover:bg-primary/20 transition-colors"
                  >
                    {isLoadingThis ? (
                      <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    ) : isCurrentlyPlaying && isPlaying ? (
                      <div className="flex items-end gap-0.5 h-4">
                        <span className="w-1 bg-primary animate-pulse rounded-full h-2"></span>
                        <span className="w-1 bg-primary animate-pulse rounded-full h-4 delay-75"></span>
                        <span className="w-1 bg-primary animate-pulse rounded-full h-3 delay-150"></span>
                      </div>
                    ) : (
                      <Play className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    )}
                  </button>

                  {/* Track Info */}
                  <div className="flex-1 min-w-0">
                    <h4
                      className={`font-medium truncate capitalize ${
                        isCurrentlyPlaying ? 'text-primary' : ''
                      }`}
                    >
                      {song.trackName || 'Unknown Track'}
                    </h4>
                    <p className="text-xs text-muted-foreground truncate capitalize">
                      {song.artistName || 'Unknown Artist'}
                    </p>
                  </div>

                  {/* Metadata */}
                  <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1" title="Cached on">
                      <Clock className="h-3 w-3" />
                      {formatDate(song.cachedAt)}
                    </div>
                    <div className="flex items-center gap-1" title="Size">
                      <HardDrive className="h-3 w-3" />
                      {song.sizeMB} MB
                    </div>
                  </div>

                  {/* Delete Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                    onClick={() => handleDeleteSong(song)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

export default Offline
