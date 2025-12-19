// src/services/cacheService.ts
// Frontend abstraction layer for audio caching

export interface CacheSettings {
  enabled: boolean
  maxSizeMB: number
}

export interface CacheStats {
  count: number
  sizeBytes: number
  sizeMB: number
}

export interface CachedSong {
  key: string
  trackId: string
  searchQuery: string
  cachedAt: number
  sizeMB: number
  // Derived fields for display
  trackName?: string
  artistName?: string
}

const DEFAULT_SETTINGS: CacheSettings = {
  enabled: true,
  maxSizeMB: 500
}

/**
 * Generate a cache key from track info
 * Uses track name and artist to create a unique, filesystem-safe key
 */
export const getCacheKey = (trackName: string, artistName: string): string => {
  const combined = `${trackName}_${artistName}`.toLowerCase()
  // Remove special characters for filesystem safety
  return combined
    .replace(/[^a-z0-9_\s]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 100) // Limit key length
}

/**
 * Parse cache key back to track name and artist (approximate)
 */
export const parseCacheKey = (key: string): { trackName: string; artistName: string } => {
  const parts = key.split('_')
  // Best effort: first part is likely track name, rest is artist
  if (parts.length >= 2) {
    // Find the likely split point - artist usually comes after a longer track name
    const midPoint = Math.ceil(parts.length / 2)
    return {
      trackName: parts.slice(0, midPoint).join(' '),
      artistName: parts.slice(midPoint).join(' ')
    }
  }
  return { trackName: key.replace(/_/g, ' '), artistName: '' }
}

/**
 * Check if caching is enabled
 */
export const isCacheEnabled = async (): Promise<boolean> => {
  try {
    const settings = await window.electron.cache.getSettings()
    return settings?.enabled ?? DEFAULT_SETTINGS.enabled
  } catch (e) {
    console.error('Error checking cache enabled:', e)
    return false
  }
}

/**
 * Get cached audio as a blob URL, or null if not cached
 */
export const getCachedAudio = async (key: string): Promise<string | null> => {
  try {
    const data = await window.electron.cache.get(key)
    if (data) {
      // Convert ArrayBuffer to Blob URL
      const blob = new Blob([data], { type: 'audio/mpeg' })
      return URL.createObjectURL(blob)
    }
    return null
  } catch (e) {
    console.error('Error getting cached audio:', e)
    return null
  }
}

/**
 * Abort controller for current caching operation
 * Used to cancel background caching when user changes source
 */
let currentCacheController: AbortController | null = null
let currentCacheKey: string | null = null

/**
 * Cancel any ongoing background caching operation
 */
export const cancelBackgroundCaching = (): void => {
  if (currentCacheController) {
    console.log('[Cache] Cancelling background caching for:', currentCacheKey)
    currentCacheController.abort()
    currentCacheController = null
    currentCacheKey = null
  }
}

/**
 * Fetch audio from URL and store in cache (runs in background, non-blocking)
 * Uses low-priority fetch to avoid interfering with playback
 * Automatically cancels previous caching if a new one starts
 */
export const cacheAudioInBackground = (
  key: string,
  url: string,
  metadata: { trackId?: string; searchQuery?: string }
): void => {
  // Cancel any previous caching operation
  cancelBackgroundCaching()

  // Create new abort controller for this operation
  const controller = new AbortController()
  currentCacheController = controller
  currentCacheKey = key

  // Run caching in background using setTimeout to not block the main thread
  setTimeout(async () => {
    try {
      // Check if this operation was cancelled
      if (controller.signal.aborted) {
        console.log('[Cache] Caching was cancelled before starting:', key)
        return
      }

      // Check if caching is enabled
      const enabled = await isCacheEnabled()
      if (!enabled) return

      // Check if already cached
      const existing = await window.electron.cache.get(key)
      if (existing) {
        console.log('[Cache] Already cached:', key)
        return
      }

      console.log('[Cache] Background caching started:', key)

      // Fetch with low priority hint and abort signal
      const response = await fetch(url, {
        priority: 'low' as RequestPriority,
        signal: controller.signal
      })

      if (!response.ok) {
        console.warn('[Cache] Failed to fetch audio for caching:', response.status)
        return
      }

      // Check if cancelled during fetch
      if (controller.signal.aborted) {
        console.log('[Cache] Caching cancelled during fetch:', key)
        return
      }

      const arrayBuffer = await response.arrayBuffer()

      // Check if cancelled during buffer read
      if (controller.signal.aborted) {
        console.log('[Cache] Caching cancelled after download:', key)
        return
      }

      // Store in cache
      await window.electron.cache.put(key, arrayBuffer, metadata)
      console.log('[Cache] Background caching completed:', key)
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.log('[Cache] Caching aborted:', key)
      } else {
        // Silently fail - caching is best effort
        console.warn('[Cache] Background caching failed:', e)
      }
    } finally {
      // Clear controller if this was the current operation
      if (currentCacheKey === key) {
        currentCacheController = null
        currentCacheKey = null
      }
    }
  }, 2000) // Wait 2 seconds after playback starts before caching
}

/**
 * Legacy sync caching function (for backwards compatibility)
 */
export const cacheAudio = async (
  key: string,
  url: string,
  metadata: { trackId?: string; searchQuery?: string }
): Promise<boolean> => {
  cacheAudioInBackground(key, url, metadata)
  return true // Return immediately, caching happens in background
}

/**
 * Delete a specific cached track
 */
export const deleteCachedAudio = async (key: string): Promise<boolean> => {
  try {
    return await window.electron.cache.delete(key)
  } catch (e) {
    console.error('Error deleting cached audio:', e)
    return false
  }
}

/**
 * Clear all cached audio
 */
export const clearCache = async (): Promise<boolean> => {
  try {
    return await window.electron.cache.clear()
  } catch (e) {
    console.error('Error clearing cache:', e)
    return false
  }
}

/**
 * Get cache statistics
 */
export const getCacheStats = async (): Promise<CacheStats> => {
  try {
    const stats = await window.electron.cache.getStats()
    return stats || { count: 0, sizeBytes: 0, sizeMB: 0 }
  } catch (e) {
    console.error('Error getting cache stats:', e)
    return { count: 0, sizeBytes: 0, sizeMB: 0 }
  }
}

/**
 * Get cache settings
 */
export const getCacheSettings = async (): Promise<CacheSettings> => {
  try {
    const settings = await window.electron.cache.getSettings()
    return settings || DEFAULT_SETTINGS
  } catch (e) {
    console.error('Error getting cache settings:', e)
    return DEFAULT_SETTINGS
  }
}

/**
 * Update cache settings
 */
export const setCacheSettings = async (settings: Partial<CacheSettings>): Promise<boolean> => {
  try {
    return await window.electron.cache.setSettings(settings)
  } catch (e) {
    console.error('Error setting cache settings:', e)
    return false
  }
}

/**
 * List all cached songs with metadata
 */
export const listCachedSongs = async (): Promise<CachedSong[]> => {
  try {
    const songs = await window.electron.cache.list()
    // Enrich with parsed track/artist names from cache key
    return songs.map((song) => {
      const { trackName, artistName } = parseCacheKey(song.key)
      return {
        ...song,
        trackName,
        artistName
      }
    })
  } catch (e) {
    console.error('Error listing cached songs:', e)
    return []
  }
}
