import { getSearchProvider, getAudioQuality, getSearchRegion } from './instanceService' // Import getAudioQuality
import { SpotifyTrack } from '@/types/spotify'

const JIOSAAVN_API_URL = 'https://jiosavan-ytify.vercel.app/api/search/songs'

export const getAudioUrlForTrack = async (track: SpotifyTrack): Promise<string> => {
  const provider = getSearchProvider()

  if (provider === 'jiosaavn') {
    return await getJioSaavnAudioUrl(track)
  } else {
    return await getYouTubeAudioUrl(track)
  }
}

export const smartSearch = async (query: string) => {
  const provider = getSearchProvider()
  if (provider === 'jiosaavn') {
    return await searchJioSaavnWithRetry(query)
  } else {
    return await searchYouTube(query)
  }
}

// --- YOUTUBE LOGIC (Electron Bridge) ---

const getYouTubeAudioUrl = async (track: SpotifyTrack): Promise<string> => {
  try {
    if (track.url) return track.url

    let videoId = track.id

    if (!videoId || videoId.length !== 11) {
      const artistNames = track.artists ? track.artists.map((a) => a.name).join(' ') : ''
      const searchQuery = `${track.name || ''} ${artistNames} song`

      // PASS REGION HERE
      const region = getSearchRegion()
      const searchResults = await window.electron.youtube.search(searchQuery, region)

      if (!searchResults || searchResults.length === 0) {
        throw new Error('No matching videos found on YouTube')
      }
      videoId = searchResults[0].id
    }

    const quality = getAudioQuality()
    const streamData = await window.electron.youtube.getStream(videoId, quality)

    if (!streamData || !streamData.url) throw new Error('Failed to extract stream')

    return streamData.url
  } catch (error) {
    console.error('YouTube URL fetch error:', error)
    throw error
  }
}

export const searchYouTube = async (query: string) => {
  try {
    // PASS REGION HERE TOO
    const region = getSearchRegion()
    return await window.electron.youtube.search(query, region)
  } catch (error) {
    console.error('YouTube search failed:', error)
    return []
  }
}

// Search regular YouTube videos (for alternative audio sources)
export const searchYouTubeVideo = async (query: string) => {
  try {
    const results = await window.electron.youtube.searchVideo(query)
    // Mark these as video sources
    return results.map((r: any) => ({ ...r, isVideoSource: true }))
  } catch (error) {
    console.error('YouTube video search failed:', error)
    return []
  }
}
// --- JIO SAAVN LOGIC (Updated for JSON Structure) ---

const getJioSaavnAudioUrl = async (track: SpotifyTrack): Promise<string> => {
  if (track.url) return track.url

  let results: any[] = []

  // --- ATTEMPT 1: Strict Search (Name + Artist) ---
  // e.g. "Singari - From Dude Sai Abhyankkar"
  try {
    const artistName = track.artists?.[0]?.name || ''
    const query1 = `${track.name} ${artistName}`.trim()
    console.log(`[JioSaavn] Attempt 1 (Strict): "${query1}"`)

    if (query1) {
      results = await searchJioSaavn(query1)
    }
    console.log(`[DEBUG] After Attempt 1: results = ${results ? results.length : 'undefined'}`) // NEW: Check exact state
  } catch (error) {
    console.warn('[JioSaavn] Attempt 1 failed:', error)
  }

  // --- ATTEMPT 2: Loose Search (Name Only) ---
  // e.g. "Singari - From Dude"
  // If first attempt returned NO results (empty array), retry with just the song name
  console.log(
    `[DEBUG] Pre-Attempt 2 check: !results=${!results}, length=0?=${(results || []).length === 0}`
  ) // NEW: Break down condition
  if (!results || results.length === 0) {
    try {
      const query2 = (track.name || '').trim()
      console.log(`[JioSaavn] Attempt 2 (Name Only): "${query2}"`)

      if (query2) {
        results = await searchJioSaavn(query2)
      }
      console.log(`[DEBUG] After Attempt 2: results = ${results ? results.length : 'undefined'}`) // NEW
    } catch (error) {
      console.warn('[JioSaavn] Attempt 2 failed:', error)
    }
  }

  // --- ATTEMPT 3: Clean Search (Remove "From Movie" / "feat") ---
  // e.g. "Singari" (Removes "- From Dude")
  // If even the name search failed, try stripping extra chars
  console.log(
    `[DEBUG] Pre-Attempt 3 check: !results=${!results}, length=0?=${(results || []).length === 0}`
  ) // NEW
  if (!results || results.length === 0) {
    try {
      // Split by common separators: '(', '-', '[', 'feat'
      // "Singari - From Dude" -> "Singari "
      const cleanName = track.name.split(/[\(\-\[]|feat\./i)[0].trim()

      // Only retry if cleaning actually changed the name
      if (cleanName && cleanName !== track.name) {
        console.log(`[JioSaavn] Attempt 3 (Clean Name): "${cleanName}"`)
        results = await searchJioSaavn(cleanName)
        console.log(`[DEBUG] After Attempt 3: results = ${results ? results.length : 'undefined'}`) // NEW
      } else {
        console.log(`[DEBUG] Skipped Attempt 3: cleanName="${cleanName}" unchanged from track.name`) // NEW: If no change
      }
    } catch (error) {
      console.warn('[JioSaavn] Attempt 3 failed:', error)
    }
  }

  // Final Check
  console.log(`[DEBUG] Final results: ${results ? results.length : 'undefined'}`) // NEW
  if (!results || results.length === 0) {
    console.error('JioSaavn URL fetch error: Track not found after 3 retries.')
    throw new Error('Track not found on JioSaavn')
  }

  // Return the URL of the best match
  return results[0].url
}

const searchJioSaavn = async (query: string) => {
  try {
    const response = await fetch(
      `${JIOSAAVN_API_URL}?query=${encodeURIComponent(query)}&page=0&limit=10`
    )
    if (!response.ok) throw new Error('JioSaavn API failed')

    const json = await response.json()
    // Support both 'data.results' (new API) and 'results' (old API) patterns
    const results = json.data?.results || json.results || []

    if (!Array.isArray(results)) return []

    return results.map((item: any) => {
      // --- 1. EXTRACT BEST AUDIO URL ---
      let downloadUrl = ''
      if (Array.isArray(item.downloadUrl)) {
        // Sort by bitrate (descending) to get 320kbps first
        // Example quality strings: "320kbps", "160kbps"
        const sorted = [...item.downloadUrl].sort((a: any, b: any) => {
          const qA = parseInt(a.quality) || 0
          const qB = parseInt(b.quality) || 0
          return qB - qA
        })
        downloadUrl = sorted[0]?.url
      } else {
        downloadUrl = item.downloadUrl
      }

      // --- 2. EXTRACT BEST IMAGE ---
      let imageUrl = ''
      if (Array.isArray(item.image)) {
        // Last image in array is usually the highest res (500x500)
        imageUrl = item.image[item.image.length - 1]?.url
      } else {
        imageUrl = item.image
      }

      // --- 3. EXTRACT ARTISTS ---
      let artists = []
      if (item.artists?.primary) {
        artists = item.artists.primary.map((a: any) => ({ name: a.name }))
      } else if (item.primaryArtists) {
        artists = [{ name: item.primaryArtists }]
      } else {
        artists = [{ name: 'Unknown Artist' }]
      }

      // Return standardized SpotifyTrack format
      return {
        id: item.id || Math.random().toString(36),
        name: item.name,
        title: item.name, // Fallback property
        url: downloadUrl,
        duration_ms: (parseInt(item.duration) || 0) * 1000,
        album: {
          id: item.album?.id,
          name: item.album?.name,
          images: [{ url: imageUrl }]
        },
        artists: artists
      }
    })
  } catch (e) {
    console.error('JioSaavn search error:', e)
    return []
  }
}

// Export function to search JioSaavn for audio source alternatives
export const searchJioSaavnResults = async (query: string) => {
  try {
    const results = await searchJioSaavn(query)
    // Mark results as JioSaavn source and add thumbnail
    return results.map((r: any) => ({
      ...r,
      isJioSaavn: true,
      thumbnail: r.album?.images?.[0]?.url,
      channelTitle: r.artists?.[0]?.name || 'JioSaavn'
    }))
  } catch (error) {
    console.error('JioSaavn results search failed:', error)
    return []
  }
}

const searchJioSaavnWithRetry = async (originalQuery: string): Promise<any[]> => {
  let results: any[] = []

  // --- ATTEMPT 1: Raw Query ---
  try {
    console.log(`[JioSaavn Smart] Attempt 1 (Raw): "${originalQuery}"`)
    results = await searchJioSaavn(originalQuery)
    console.log(`[JioSaavn Smart] Attempt 1: ${results.length} results`)
  } catch (error) {
    console.warn('[JioSaavn Smart] Attempt 1 failed:', error)
  }

  // --- ATTEMPT 2: Name-Only (Strip Trailing Artist/Movie/Song) ---
  if (!results || results.length === 0) {
    try {
      // Heuristic: Take everything before the last major separator (e.g., " - ", " by ", " song", " from ")
      const separators = /[\s\-]by[\s\-]|[\s\-]from[\s\-]|[\s\-]song|[\s\-]feat\.?/i
      const query2 = originalQuery.split(separators)[0].trim()
      console.log(`[JioSaavn Smart] Attempt 2 (Name-Only): "${query2}"`)

      if (query2 && query2 !== originalQuery) {
        // Avoid redundant call
        results = await searchJioSaavn(query2)
        console.log(`[JioSaavn Smart] Attempt 2: ${results.length} results`)
      }
    } catch (error) {
      console.warn('[JioSaavn Smart] Attempt 2 failed:', error)
    }
  }

  // --- ATTEMPT 3: Cleaned (Remove Parentheticals/Dashes) ---
  if (!results || results.length === 0) {
    try {
      // Aggressive clean: Split by common extras and take first chunk
      const cleanQuery = originalQuery.split(/[\(\)\-\[\]]|from|feat|song/i)[0].trim()
      console.log(`[JioSaavn Smart] Attempt 3 (Clean): "${cleanQuery}"`)

      if (cleanQuery && cleanQuery !== originalQuery && cleanQuery !== (results?.[0]?.name || '')) {
        results = await searchJioSaavn(cleanQuery)
        console.log(`[JioSaavn Smart] Attempt 3: ${results.length} results`)
      }
    } catch (error) {
      console.warn('[JioSaavn Smart] Attempt 3 failed:', error)
    }
  }

  // Final fallback: If still empty, log and return []
  if (!results || results.length === 0) {
    console.error('[JioSaavn Smart] No results after 3 attempts for:', originalQuery)
  }

  return results
}
