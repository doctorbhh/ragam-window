// Song ID Cache - Caches resolved source IDs to skip expensive searches on repeat plays
// For YouTube: caches the video ID (11-char string)
// For JioSaavn: caches the full download URL

const STORAGE_KEY = 'songIdCache'
const MAX_ENTRIES = 2000

interface CachedSongId {
  sourceId: string
  provider: 'youtube' | 'jiosaavn'
  title: string
  cachedAt: number
}

type SongIdCacheMap = Record<string, CachedSongId>

const loadCache = (): SongIdCacheMap => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as SongIdCacheMap
  } catch {
    return {}
  }
}

const saveCache = (cache: SongIdCacheMap): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch (e) {
    console.warn('[SongIdCache] Failed to save:', e)
  }
}

/**
 * Evict oldest entries when cache exceeds MAX_ENTRIES
 */
const evictIfNeeded = (cache: SongIdCacheMap): SongIdCacheMap => {
  const keys = Object.keys(cache)
  if (keys.length <= MAX_ENTRIES) return cache

  // Sort by cachedAt ascending (oldest first), remove excess
  const sorted = keys.sort((a, b) => cache[a].cachedAt - cache[b].cachedAt)
  const toRemove = sorted.slice(0, keys.length - MAX_ENTRIES)
  for (const key of toRemove) {
    delete cache[key]
  }
  return cache
}

/**
 * Get a cached song source ID for a given cache key
 */
export const getSongIdFromCache = (cacheKey: string): CachedSongId | null => {
  const cache = loadCache()
  const entry = cache[cacheKey]
  if (!entry) return null
  console.log(`[SongIdCache] HIT: ${cacheKey} → ${entry.provider}:${entry.sourceId.slice(0, 30)}`)
  return entry
}

/**
 * Save a resolved song source ID to the cache
 */
export const saveSongIdToCache = (
  cacheKey: string,
  sourceId: string,
  provider: 'youtube' | 'jiosaavn',
  title: string
): void => {
  const cache = loadCache()
  cache[cacheKey] = {
    sourceId,
    provider,
    title,
    cachedAt: Date.now()
  }
  evictIfNeeded(cache)
  saveCache(cache)
  console.log(`[SongIdCache] Saved: ${cacheKey} → ${provider}:${sourceId.slice(0, 30)}`)
}
