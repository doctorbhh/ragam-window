import { useEffect, useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { SongCard } from './SongCard.tsx'
import { useSpotifyAuth } from '@/context/SpotifyAuthContext'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { getAIRecommendations } from '@/services/firebaseRecommendations'
import { usePlayer } from '@/context/PlayerContext'
import { searchTracks } from '@/services/spotifyservice' // Import the search service

export function AIRecommendations() {
  const { user, spotifyToken } = useSpotifyAuth()
  const { addManyToQueue } = usePlayer()
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(false)
  const [hasGeneratedToday, setHasGeneratedToday] = useState(false)

  useEffect(() => {
    if (user?.id) {
      // Optional: Check if we already have recommendations saved in local state/DB to avoid refetching on every mount
      // For now, we wait for user action or just load if empty
    }
  }, [user])

  const fetchRecommendations = async () => {
    if (!user?.id || !spotifyToken) return

    setLoading(true)
    try {
      // 1. Get raw text recommendations from Gemini
      const recData = await getAIRecommendations(user.id)

      if (!recData || recData.length === 0) {
        toast.error('Could not generate recommendations. Try listening to more music first.')
        setLoading(false)
        return
      }

      // 2. Search Spotify for each recommendation to get real metadata (images, preview_url, etc.)
      const tracksPromises = recData.map(async (rec) => {
        try {
          const query = `track:${rec.track_name} artist:${rec.artist_name}`
          const searchResult = await searchTracks(spotifyToken, query, 0, 1)

          if (searchResult?.tracks?.items?.length > 0) {
            return searchResult.tracks.items[0] // Return the actual Spotify track object
          }
          return null
        } catch (err) {
          console.warn(`Could not find track on Spotify: ${rec.track_name}`)
          return null
        }
      })

      const resolvedTracks = await Promise.all(tracksPromises)
      const validTracks = resolvedTracks.filter((track) => track !== null)

      setRecommendations(validTracks)
      setHasGeneratedToday(true)

      if (validTracks.length > 0) {
        // Add recommendations to queue
        addManyToQueue(validTracks)
        toast.success(`Added ${validTracks.length} AI recommendations to queue!`)
      } else {
        toast.error("AI suggested songs, but we couldn't find them on Spotify.")
      }
    } catch (error) {
      console.error('Error fetching recommendations:', error)
      toast.error('Failed to generate recommendations. Check your API key.')
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
                  artist={track.artists?.map((a) => a.name).join(', ')}
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
