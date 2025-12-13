import { getSearchProvider, getAudioQuality, getSearchRegion } from './instanceService' // Import getAudioQuality
import { SpotifyTrack } from '@/types/spotify'

const JIOSAAVN_API_URL = 'https://jiosavan-ytify.vercel.app/api/search/songs'

declare global {
  interface Window {
    electron: {
      youtube: {
        // UPDATE TYPES
        search: (query: string, region?: string) => Promise<any[]>
        getStream: (
          videoId: string,
          quality?: string
        ) => Promise<{ url: string; duration: number } | null>
      }
    }
  }
}

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
    return await searchJioSaavn(query)
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
// --- JIO SAAVN LOGIC (Updated for JSON Structure) ---

const getJioSaavnAudioUrl = async (track: SpotifyTrack): Promise<string> => {
  if (track.url) return track.url

  // 1. Construct Query
  const artistName = track.artists?.[0]?.name || ''
  const query = `${track.name} ${artistName}`.trim()

  // 2. Search
  let results = await searchJioSaavn(query)

  // 3. Fallback: Search by name only if specific search fails
  if (!results || results.length === 0) {
    results = await searchJioSaavn(track.name)
  }

  if (results.length > 0) {
    return results[0].url! // Return best match URL
  }

  throw new Error('Track not found on JioSaavn')
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
