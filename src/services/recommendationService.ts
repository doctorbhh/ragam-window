import { smartSearch } from './youtubeService'
import { SpotifyTrack } from '@/types/spotify'

// Keep track of suggested IDs in this session to prevent immediate repeats
const sessionGeneratedIds = new Set<string>()

/**
 * Generates a list of 10 unique recommendations based on a seed track.
 * Uses a "Search & Filter" strategy to ensure quality and quantity.
 */
export const getAIRecommendations = async (
  seedTrack: SpotifyTrack,
  userHistory: string[] = [] // Pass the last ~50 played song IDs here
): Promise<SpotifyTrack[]> => {
  try {
    console.log(`[AI] Generating recommendations for: ${seedTrack.name}`)

    const artistName = seedTrack.artists?.[0]?.name || ''
    const trackName = seedTrack.name

    // 1. GENERATE MULTIPLE PROMPTS
    // We search for different things to get a diverse pool of songs
    const queries = [
      `Songs similar to ${trackName} ${artistName}`,
      `Best songs by ${artistName}`,
      `${artistName} radio mix`,
      `${trackName} song radio`
    ]

    // 2. PARALLEL EXECUTION (Faster)
    // Run all searches at once. If one fails, others might succeed.
    const searchPromises = queries.map((q) =>
      smartSearch(q).catch((e) => {
        console.warn(`[AI] Search failed for query: "${q}"`, e)
        return []
      })
    )

    const resultsArray = await Promise.all(searchPromises)

    // 3. AGGREGATE & DEDUPLICATE
    const candidates: SpotifyTrack[] = []
    const seenNames = new Set<string>()

    // Add seed track names to "seen" so we don't recommend the song currently playing
    seenNames.add(normalizeString(seedTrack.name))

    // Also add user history to "seen" (names and IDs)
    userHistory.forEach((id) => sessionGeneratedIds.add(id))

    // Flatten results and filter
    for (const group of resultsArray) {
      for (const track of group) {
        if (!track || !track.id) continue

        const normName = normalizeString(track.name)

        // CHECK: Is this song valid?
        const isDuplicate = seenNames.has(normName)
        const isPlayedRecently = sessionGeneratedIds.has(track.id)
        const isTooShort = track.duration_ms < 60000 // Skip < 1 min snippets

        if (!isDuplicate && !isPlayedRecently && !isTooShort) {
          candidates.push(track)
          seenNames.add(normName)
          // Don't add to session ID yet, only add if we actually pick it
        }
      }
    }

    // 4. SHUFFLE & SELECT
    // Randomize the candidates so it's not always the same order
    const shuffled = candidates.sort(() => 0.5 - Math.random())

    // Pick top 10
    const finalSelection = shuffled.slice(0, 10)

    // 5. FILLER LOGIC (If we have < 10 songs)
    if (finalSelection.length < 10) {
      console.log('[AI] Not enough songs found. Fetching generic fallback...')
      try {
        // Fallback: Just get generic popular songs for the artist
        const fallbackRes = await smartSearch(`${artistName} top hits`)
        for (const track of fallbackRes) {
          if (finalSelection.length >= 10) break
          if (!sessionGeneratedIds.has(track.id)) {
            finalSelection.push(track)
          }
        }
      } catch (e) {
        console.error('Fallback failed')
      }
    }

    // Update Session Cache
    finalSelection.forEach((t) => sessionGeneratedIds.add(t.id))

    console.log(`[AI] Generated ${finalSelection.length} unique songs.`)
    return finalSelection
  } catch (error) {
    console.error('[AI] Generation Critical Failure:', error)
    return []
  }
}

// Helper: Normalize string for fuzzy matching (removes punctuation, case)
const normalizeString = (str: string) => {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

/**
 * Call this when the app starts or user clears queue to reset "session memory"
 */
export const clearRecommendationSession = () => {
  sessionGeneratedIds.clear()
}
