import { ref, push, set, get, query, orderByChild, limitToLast } from 'firebase/database'
import { db } from '@/lib/firebase'
import { SpotifyTrack } from '@/types/spotify'

// Interface for the Recommendation object returned by AI
export interface AIRecommendation {
  id: string
  track_name: string
  artist_name: string
  reason: string
  genres: string[]
}

// Interface for the raw JSON response from Gemini before we add IDs
interface RawRecommendation {
  track_name: string
  artist_name: string
  reason: string
  genres: string[]
}

// Interface for data stored in Firebase
interface ListeningHistoryItem {
  track_id: string
  track_name: string
  artist_name: string
  album_name: string
  played_at: number
  duration_ms: number
}

// Ensure VITE_GEMINI_API_KEY is defined in your .env file
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''

// Helper to call Gemini with a specific model
const callGeminiAPI = async (modelName: string, prompt: string): Promise<any> => {
  if (!API_KEY) throw new Error('Gemini API Key is missing.')

  // Using the v1beta endpoint which supports the latest models
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: 'application/json'
      }
    })
  })

  if (!response.ok) {
    let errorMessage = response.statusText
    try {
      const errorData = await response.json()
      errorMessage = errorData.error?.message || JSON.stringify(errorData)
    } catch (e) {
      /* empty */
    }

    const error = new Error(`Gemini API Error (${response.status}): ${errorMessage}`)
    // @ts-ignore - appending status to error object
    error.status = response.status
    throw error
  }

  const data = await response.json()
  const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!textResponse) throw new Error('No content in Gemini response')

  // Clean and parse JSON
  const jsonString = textResponse
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim()
  return JSON.parse(jsonString)
}

// Track a song play for recommendation engine
export const trackListening = async (userId: string, track: SpotifyTrack): Promise<void> => {
  try {
    const listeningRef = ref(db, `user_listening/${userId}`)
    const newListeningRef = push(listeningRef)

    const historyItem: ListeningHistoryItem = {
      track_id: track.id,
      track_name: track.name,
      artist_name: track.artists.map((a) => a.name).join(', '),
      album_name: track.album?.name || '',
      played_at: Date.now(),
      duration_ms: track.duration_ms
    }

    await set(newListeningRef, historyItem)

    console.log('Successfully tracked listening history')
  } catch (error) {
    console.error('Error tracking listening:', error)
  }
}

// Helper to normalize track names for comparison
const normalizeTrackName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // Remove parentheses content
    .replace(/\[.*?\]/g, '') // Remove bracket content
    .replace(/feat\..*/i, '') // Remove "feat." and everything after
    .replace(/ft\..*/i, '') // Remove "ft." and everything after
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .replace(/\s+/g, ' ')
    .trim()
}

// Keep track of previously recommended tracks across sessions
const previouslyRecommended = new Set<string>()

// Get AI recommendations with Fallback Strategy
export const getAIRecommendations = async (userId: string): Promise<AIRecommendation[]> => {
  try {
    // 1. Get user listening history
    const listeningQuery = query(
      ref(db, `user_listening/${userId}`),
      orderByChild('played_at'),
      limitToLast(50)
    )

    const snapshot = await get(listeningQuery)

    if (!snapshot.exists()) {
      console.log('No listening history found')
      return []
    }

    const listeningHistory: ListeningHistoryItem[] = []
    snapshot.forEach((childSnapshot) => {
      listeningHistory.push(childSnapshot.val())
    })

    // 2. Analysis
    const recentPlays = [...listeningHistory].reverse()
    
    // Get unique recently played tracks (to explicitly avoid)
    const recentTracksToAvoid = [...new Set(
      recentPlays.slice(0, 20).map((t) => `${t.track_name} - ${t.artist_name}`)
    )]

    const recentTrackNames = recentPlays
      .slice(0, 5)
      .map((t) => `${t.track_name} by ${t.artist_name}`)

    const artistCounts: Record<string, number> = {}
    recentPlays.forEach((t) => {
      const artist = t.artist_name.split(',')[0].trim()
      artistCounts[artist] = (artistCounts[artist] || 0) + 1
    })

    const topArtists = Object.entries(artistCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name]) => name)

    if (topArtists.length === 0) return []

    // Get unique track names for deduplication
    const playedTrackNamesNormalized = new Set(
      recentPlays.map((t) => normalizeTrackName(t.track_name))
    )

    // 3. Construct Enhanced Prompt
    const prompt = `
      You are a music recommendation AI. Based on the following user music taste, suggest 15 distinct song recommendations.
      
      IMPORTANT RULES:
      1. DO NOT suggest any songs from the "AVOID THESE" list below
      2. Recommend a diverse mix: 60% similar artists, 40% discovery (different but related genres)
      3. Include some hidden gems, not just top hits
      4. Each song must be by a DIFFERENT artist (no duplicate artists in recommendations)
      
      User's Top Artists: ${topArtists.join(', ')}
      Recently Played: ${recentTrackNames.join('; ')}
      
      AVOID THESE SONGS (DO NOT RECOMMEND ANY OF THESE):
      ${recentTracksToAvoid.slice(0, 15).join('\n')}
      
      Return ONLY a raw JSON array (no markdown formatting) of objects with these fields:
      - "track_name": string (exact song title)
      - "artist_name": string (primary artist only)
      - "reason": string (one sentence why it fits)
      - "genres": string[] (1-2 genres)
      
      Ensure all 15 songs are UNIQUE and NOT in the avoid list.
    `

    // 4. Call Gemini API with Latest Models
    let rawRecommendations: RawRecommendation[] = []
    try {
      // Primary: Gemini 2.5 Flash (Current Stable)
      rawRecommendations = await callGeminiAPI('gemini-2.5-flash', prompt)
      console.log('[AI] Raw recommendations received:', rawRecommendations.length)
    } catch (error: any) {
      console.warn('Primary model failed, trying fallback...', error.message)
      if (error.status === 404 || error.status === 503) {
        try {
          rawRecommendations = await callGeminiAPI('gemini-2.0-flash', prompt)
        } catch (fallbackError) {
          try {
            rawRecommendations = await callGeminiAPI('gemini-1.5-flash-latest', prompt)
          } catch (finalError: any) {
            console.error('All model attempts failed:', finalError.message)
            return []
          }
        }
      } else {
        return []
      }
    }

    // 5. Post-process: Filter duplicates and already played
    const seenArtists = new Set<string>()
    const filteredRecommendations: RawRecommendation[] = []

    for (const rec of rawRecommendations) {
      const normalizedName = normalizeTrackName(rec.track_name)
      const normalizedArtist = rec.artist_name.toLowerCase().trim()
      const recKey = `${normalizedName}:${normalizedArtist}`

      // Skip if already played, already recommended, or duplicate artist
      if (playedTrackNamesNormalized.has(normalizedName)) {
        console.log(`[AI] Skipping (already played): ${rec.track_name}`)
        continue
      }
      if (previouslyRecommended.has(recKey)) {
        console.log(`[AI] Skipping (previously recommended): ${rec.track_name}`)
        continue
      }
      if (seenArtists.has(normalizedArtist)) {
        console.log(`[AI] Skipping (duplicate artist): ${rec.track_name} by ${rec.artist_name}`)
        continue
      }

      filteredRecommendations.push(rec)
      seenArtists.add(normalizedArtist)
      previouslyRecommended.add(recKey)

      // Stop once we have 10 good recommendations
      if (filteredRecommendations.length >= 10) break
    }

    console.log(`[AI] Final recommendations after filtering: ${filteredRecommendations.length}`)

    // Add temporary IDs
    return filteredRecommendations.map((rec, index) => ({
      ...rec,
      id: `rec_${Date.now()}_${index}`
    }))
  } catch (error) {
    console.error('Error in getAIRecommendations:', error)
    return []
  }
}

// Clear recommendation session (useful for fresh recommendations)
export const clearRecommendationSession = () => {
  previouslyRecommended.clear()
  console.log('[AI] Recommendation session cleared')
}

