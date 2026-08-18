// Shared types and utilities for the Player component family

/** A single line of synced lyrics with its timestamp */
export interface LyricLine {
  time: number
  text: string
}

/** A search result from the LRCLIB lyrics API */
export interface LyricsSearchResult {
  id: number
  name: string
  trackName: string
  artistName: string
  albumName?: string
  duration: number
  syncedLyrics?: string
  plainLyrics?: string
}

/**
 * Creates a deterministic, filesystem-safe key for a track.
 * Used for persisting lyrics and source preferences.
 */
export function createTrackKey(track: { name: string; artists?: { name: string }[] }): string {
  const allArtists = track.artists?.map((a) => a.name).join('_') || ''
  return `${track.name}_${allArtists}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 100)
}

/** Formats seconds into a mm:ss display string */
export function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** Parses an LRC-format string into an array of LyricLine objects */
export function parseLRC(lrcString: string): LyricLine[] {
  const lines = lrcString.split('\n')
  const result: LyricLine[] = []
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/

  for (const line of lines) {
    const match = line.match(timeRegex)
    if (match) {
      const minutes = parseInt(match[1])
      const seconds = parseInt(match[2])
      const ms = parseInt(match[3].padEnd(3, '0').substring(0, 3))
      const time = minutes * 60 + seconds + ms / 1000
      const text = line.replace(timeRegex, '').trim()
      if (text) result.push({ time, text })
    }
  }
  return result
}
