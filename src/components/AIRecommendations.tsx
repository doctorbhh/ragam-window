import { useEffect, useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { SongCard } from './SongCard'
import { useSpotifyAuth } from '@/context/SpotifyAuthContext'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { getAIRecommendations } from '@/services/firebaseRecommendations.ts'
import { usePlayer } from '@/context/PlayerContext'
import { searchTracks } from '@/services/spotifyservice'
import { SpotifyTrack } from '@/types/spotify' // Import Type

export function AIRecommendations() {
  const { user, spotifyToken } = useSpotifyAuth()
  const { addManyToQueue } = usePlayer()
  // Fix: Explicitly type the state
  const [recommendations, setRecommendations] = useState<SpotifyTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [hasGeneratedToday, setHasGeneratedToday] = useState(false)

  useEffect(() => {
    // Optional: Load saved recommendations
  }, [user])

  const fetchRecommendations = async () => {
    if (!user?.id || !spotifyToken) return

    setLoading(true)
    try {
      const recData = await getAIRecommendations(user.id)

      if (!recData || recData.length === 0) {
        toast.error('Could not generate recommendations. Ensure you have a listening history.')
        setLoading(false)
        return
      }

      const tracksPromises = recData.map(async (rec: any) => {
        // Type 'rec' as any
        try {
          const query = `track:${rec.track_name} artist:${rec.artist_name}`
          // @ts-ignore - Ignore potential type mismatch in searchTracks for now
          const searchResult = await searchTracks(spotifyToken, query, 0, 1)

          if (searchResult?.tracks?.items?.length > 0) {
            return searchResult.tracks.items[0]
          }
          return null
        } catch (err) {
          return null
        }
      })

      const resolvedTracks = await Promise.all(tracksPromises)
      // Fix: Cast the filter result to SpotifyTrack[]
      const validTracks = resolvedTracks.filter((track): track is SpotifyTrack => track !== null)

      setRecommendations(validTracks)
      setHasGeneratedToday(true)

      if (validTracks.length > 0) {
        addManyToQueue(validTracks)
        toast.success(`Added ${validTracks.length} AI recommendations to queue!`)
      } else {
        toast.error("AI suggested songs, but we couldn't find them on Spotify.")
      }
    } catch (error) {
      console.error('Error fetching recommendations:', error)
      toast.error('Failed to generate recommendations.')
    } finally {
      setLoading(false)
    }
  }

  const generateNewRecommendations = async () => {
    await fetchRecommendations()
  }

  if (!user) return null

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold text-foreground">AI Recommendations for You</h2>
        </div>
        {!loading && (
          <Button
            onClick={generateNewRecommendations}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            {hasGeneratedToday ? 'Regenerate' : 'Generate New'}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Consulting the AI DJ...</span>
        </div>
      ) : recommendations.length > 0 ? (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Based on your recent listening history
          </p>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {recommendations.slice(0, 12).map((track) => (
              <div key={track.id} className="relative">
                <SongCard
                  title={track.name}
                  // Fix: Type 'a' as any to avoid implicit any error
                  artist={track.artists?.map((a: any) => a.name).join(', ')}
                  imageUrl={track.album?.images?.[0]?.url}
                  imageGradient="bg-gradient-to-br from-purple-500/20 to-blue-500/20"
                  track={track}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 px-4 rounded-lg bg-card/60 backdrop-blur border border-border/50">
          <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No recommendations yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Click generate to get a personalized playlist based on your taste.
          </p>
          <Button onClick={generateNewRecommendations} size="sm">
            Generate Recommendations
          </Button>
        </div>
      )}
    </div>
  )
}
