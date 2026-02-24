import { app, BrowserWindow, ipcMain, session, dialog, Tray, Menu, nativeImage, NativeImage, protocol } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import http from 'node:http'
import { execFile, spawn } from 'child_process'
import { initSpotifyHandlers } from './spotifyHandler'
import { spotifyAuth } from './spotifyAuth'
import { initYTMusicHandlers } from './ytmusicHandler'
import * as ytmusicAuth from './ytmusicAuth'
import { registerThumbProtocol } from './thumbnailCache'

// 1. STANDARD CONFIGURATION
app.commandLine.appendSwitch('ignore-certificate-errors')

// Register custom protocol scheme BEFORE app.ready (Electron requirement)
protocol.registerSchemesAsPrivileged([
  { scheme: 'thumb-cache', privileges: { standard: false, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
])

// --- CACHE CONFIGURATION ---
const CACHE_DIR = path.join(app.getPath('userData'), 'audio-cache')
const CACHE_SETTINGS_FILE = path.join(app.getPath('userData'), 'cache-settings.json')

interface CacheMetadata {
  trackId: string
  searchQuery: string
  cachedAt: number
  size: number
}

interface CacheSettings {
  enabled: boolean
  maxSizeMB: number
}

const DEFAULT_CACHE_SETTINGS: CacheSettings = {
  enabled: true,
  maxSizeMB: 500
}

// --- HLS PROXY SERVER ---
// Proxies YouTube HLS streams to bypass CORS restrictions
const INITIAL_PROXY_PORT = 47831
let currentProxyPort = INITIAL_PROXY_PORT
let proxyServer: http.Server | null = null

const startProxyServer = () => {
  if (proxyServer) return
  
  proxyServer = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || '', `http://localhost:${currentProxyPort}`)
      const pathname = reqUrl.pathname

      // --- NEW: DIRECT STREAMING ENDPOINT ---
      // Pipes yt-dlp output directly to response
      if (pathname === '/stream') {
        const videoId = reqUrl.searchParams.get('id')
        const quality = reqUrl.searchParams.get('quality') || '720'
        
        if (!videoId) {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('Missing id parameter')
          return
        }

        const isDev = !app.isPackaged
        const ffmpegPath = isDev 
          ? path.join(__dirname, '../bin/ffmpeg.exe')
          : path.join(process.resourcesPath, 'bin', 'ffmpeg.exe')
        
        console.log(`[Proxy] Streaming video: ${videoId} (${quality}p)`)
        console.log(`[Proxy] Using ffmpeg from: ${ffmpegPath}`)

        const formatSelector = `bv*[height<=${quality}]+ba/b[height<=${quality}]/b`

        const args = [
          `https://www.youtube.com/watch?v=${videoId}`,
          '-o', '-', // Output to stdout
          '--format', formatSelector,
          '--ffmpeg-location', ffmpegPath,
          '--merge-output-format', 'mkv',  // MKV/WebM is streamable and supports VP9/Opus
          '--no-warnings',
          '--no-check-certificate',
          '--no-progress',
          '--quiet',
          '--user-agent', ELECTRON_USER_AGENT
        ]

        // Spawn yt-dlp process
        const ytProcess = spawn(ytDlpPath, args)

        // Set headers for video stream - WebM is safe for Chrome/Electron
        res.writeHead(200, {
          'Content-Type': 'video/webm',
          'Access-Control-Allow-Origin': '*',
          // 'Transfer-Encoding': 'chunked'
        })

        // Pipe stdout to response
        ytProcess.stdout.pipe(res)

        // Error handling
        ytProcess.stderr.on('data', (data: Buffer) => {
          // Log only critical errors or first few lines to avoid spam
          const msg = data.toString()
          if (msg.includes('Error') || msg.includes('headers')) {
            console.error(`[Proxy] yt-dlp stderr: ${msg}`)
          }
        })

        ytProcess.on('error', (err: Error) => {
          console.error('[Proxy] Process error:', err)
          if (!res.headersSent) {
            res.writeHead(500)
            res.end('Stream process error')
          }
        })

        // Cleanup when client disconnects
        req.on('close', () => {
          console.log('[Proxy] Client disconnected, killing process')
          ytProcess.kill()
        })

        return
      }

      // --- AUDIO STREAMING ENDPOINT ---
      // Pipes yt-dlp audio directly to response (bypasses URL signing issues)
      if (pathname === '/audio') {
        const videoId = reqUrl.searchParams.get('id')
        const quality = reqUrl.searchParams.get('quality') || 'high'
        
        if (!videoId) {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('Missing id parameter')
          return
        }

        console.log(`[Proxy] Streaming audio: ${videoId} (quality: ${quality})`)

        // Quality-based format selection
        let formatSelector = 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best'
        if (quality === 'medium') {
          formatSelector = 'bestaudio[abr<=128][ext=m4a]/bestaudio[abr<=128]/bestaudio'
        } else if (quality === 'low') {
          formatSelector = 'worstaudio[ext=m4a]/worstaudio'
        }

        const args = [
          `https://www.youtube.com/watch?v=${videoId}`,
          '-o', '-', // Output to stdout
          '--format', formatSelector,
          '--no-warnings',
          '--no-check-certificate',
          '--user-agent', ELECTRON_USER_AGENT,
          '--no-playlist'
        ]

        const ytProcess = spawn(ytDlpPath, args)

        // Set headers for audio stream
        res.writeHead(200, {
          'Content-Type': 'audio/mp4', // m4a is audio/mp4
          'Access-Control-Allow-Origin': '*',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache'
        })

        // Pipe stdout to response
        ytProcess.stdout.pipe(res)

        // Error handling
        ytProcess.stderr.on('data', (data: Buffer) => {
          const msg = data.toString()
          // Only log actual errors, not progress
          if (msg.includes('ERROR') || msg.includes('error')) {
            console.error(`[Proxy] yt-dlp audio error: ${msg}`)
          }
        })

        ytProcess.on('error', (err: Error) => {
          console.error('[Proxy] Audio process error:', err)
          if (!res.headersSent) {
            res.writeHead(500)
            res.end('Audio stream process error')
          }
        })

        ytProcess.on('close', (code) => {
          if (code !== 0 && code !== null) {
            console.error(`[Proxy] yt-dlp exited with code ${code}`)
          }
        })

        // Cleanup when client disconnects
        req.on('close', () => {
          console.log('[Proxy] Audio client disconnected, killing process')
          ytProcess.kill()
        })

        return
      }

      // --- HLS PLAYLIST GENERATOR ---
      // Generates a custom m3u8 master playlist from available YouTube formats
      if (pathname === '/playlist') {
        const videoId = reqUrl.searchParams.get('id')
        
        if (!videoId) {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('Missing id parameter')
          return
        }

        console.log(`[Proxy] Generating HLS playlist for: ${videoId}`)

        try {
          // Get all available formats
          const args = [
            `https://www.youtube.com/watch?v=${videoId}`,
            '--dump-single-json',
            '--no-warnings',
            '--no-check-certificate',
            '--user-agent', ELECTRON_USER_AGENT
          ]

          const ytProcess = spawn(ytDlpPath, args)
          let jsonOutput = ''

          ytProcess.stdout.on('data', (data: Buffer) => {
            jsonOutput += data.toString()
          })

          ytProcess.on('close', (code) => {
            if (code !== 0) {
              res.writeHead(500, { 'Content-Type': 'text/plain' })
              res.end('Failed to get video info')
              return
            }

            try {
              const output = JSON.parse(jsonOutput)
              
              // Filter for muxed formats (video + audio together)
              const muxedFormats = (output.formats || [])
                .filter((f: any) => 
                  f.vcodec !== 'none' && 
                  f.acodec !== 'none' && 
                  f.url &&
                  f.height
                )
                .sort((a: any, b: any) => (b.height || 0) - (a.height || 0))

              if (muxedFormats.length === 0) {
                res.writeHead(404, { 'Content-Type': 'text/plain' })
                res.end('No muxed formats available')
                return
              }

              // Generate HLS master playlist
              let m3u8 = '#EXTM3U\n'
              m3u8 += '#EXT-X-VERSION:3\n'

              // Add each quality as a variant stream
              for (const format of muxedFormats) {
                const bandwidth = format.tbr ? Math.round(format.tbr * 1000) : (format.height * 3000)
                const resolution = `${format.width || format.height * 16 / 9}x${format.height}`
                const proxyUrl = `http://localhost:${currentProxyPort}/proxy?url=${encodeURIComponent(format.url)}`
                
                m3u8 += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution},NAME="${format.height}p"\n`
                m3u8 += `${proxyUrl}\n`
              }

              // Set response headers
              res.writeHead(200, {
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache'
              })
              res.end(m3u8)

              console.log(`[Proxy] Generated HLS playlist with ${muxedFormats.length} qualities`)
            } catch (parseError) {
              console.error('[Proxy] Failed to parse yt-dlp output:', parseError)
              res.writeHead(500, { 'Content-Type': 'text/plain' })
              res.end('Failed to parse video info')
            }
          })

          ytProcess.on('error', (err) => {
            console.error('[Proxy] yt-dlp error:', err)
            res.writeHead(500, { 'Content-Type': 'text/plain' })
            res.end('Failed to start yt-dlp')
          })

          return
        } catch (error: any) {
          console.error('[Proxy] Playlist error:', error)
          res.writeHead(500, { 'Content-Type': 'text/plain' })
          res.end(`Playlist error: ${error.message}`)
          return
        }
      }

      // --- EXISTING HLS PROXY LOGIC ---
      const targetUrl = reqUrl.searchParams.get('url')
      
      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Missing url or id parameter')
        return
      }
      
      // Fetch from YouTube with proper headers
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': ELECTRON_USER_AGENT,
          'Referer': 'https://www.youtube.com/',
          'Origin': 'https://www.youtube.com'
        }
      })
      
      if (!response.ok) {
        res.writeHead(response.status)
        res.end(`Upstream error: ${response.status}`)
        return
      }
      
      const contentType = response.headers.get('content-type') || 'application/octet-stream'
      
      // Set CORS headers
      const headers: Record<string, string> = {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }
      
      // Handle OPTIONS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204, headers)
        res.end()
        return
      }
      
      // For m3u8 manifests, rewrite URLs to go through proxy
      if (targetUrl.includes('.m3u8') || contentType.includes('mpegurl')) {
        let content = await response.text()
        // Rewrite absolute URLs
        content = content.replace(/^(https?:\/\/[^\s]+)/gm, (match) => {
          return `http://localhost:${currentProxyPort}/proxy?url=${encodeURIComponent(match)}`
        })
        res.writeHead(200, headers)
        res.end(content)
      } else {
        // Stream binary content (video segments)
        const buffer = Buffer.from(await response.arrayBuffer())
        res.writeHead(200, { ...headers, 'Content-Length': buffer.length.toString() })
        res.end(buffer)
      }
    } catch (error: any) {
      console.error('[HLS Proxy] Error:', error.message)
      res.writeHead(500)
      res.end(`Proxy error: ${error.message}`)
    }
  })
  
  proxyServer.listen(currentProxyPort, () => {
    console.log(`[Proxy] Server running on port ${currentProxyPort}`)
  })
  
  proxyServer.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Proxy] Port ${currentProxyPort} in use, trying next port`)
      currentProxyPort++
      proxyServer?.listen(currentProxyPort)
    } else {
      console.error('[Proxy] Server error:', err)
    }
  })
}

const stopProxyServer = () => {
  if (proxyServer) {
    proxyServer.close()
    proxyServer = null
    console.log('[HLS Proxy] Server stopped')
  }
}

// Export port for use in IPC handlers
const getProxyPort = () => currentProxyPort

// Ensure cache directory exists
const ensureCacheDir = () => {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
  }
}

// Get cache settings
const getCacheSettings = (): CacheSettings => {
  try {
    if (fs.existsSync(CACHE_SETTINGS_FILE)) {
      const data = fs.readFileSync(CACHE_SETTINGS_FILE, 'utf-8')
      return { ...DEFAULT_CACHE_SETTINGS, ...JSON.parse(data) }
    }
  } catch (e) {
    console.error('Error reading cache settings:', e)
  }
  return DEFAULT_CACHE_SETTINGS
}

// Save cache settings
const saveCacheSettings = (settings: CacheSettings) => {
  try {
    fs.writeFileSync(CACHE_SETTINGS_FILE, JSON.stringify(settings, null, 2))
  } catch (e) {
    console.error('Error saving cache settings:', e)
  }
}

// Get all cached files with metadata
const getCacheEntries = (): { key: string; metadata: CacheMetadata; audioPath: string }[] => {
  ensureCacheDir()
  const entries: { key: string; metadata: CacheMetadata; audioPath: string }[] = []

  try {
    const files = fs.readdirSync(CACHE_DIR)
    const metaFiles = files.filter((f) => f.endsWith('.meta.json'))

    for (const metaFile of metaFiles) {
      const key = metaFile.replace('.meta.json', '')
      const audioPath = path.join(CACHE_DIR, `${key}.audio`)
      const metaPath = path.join(CACHE_DIR, metaFile)

      if (fs.existsSync(audioPath)) {
        try {
          const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
          entries.push({ key, metadata, audioPath })
        } catch (e) {
          // Skip corrupted entries
        }
      }
    }
  } catch (e) {
    console.error('Error reading cache entries:', e)
  }

  return entries
}

// Get total cache size in bytes
const getCacheSizeBytes = (): number => {
  const entries = getCacheEntries()
  return entries.reduce((total, entry) => total + (entry.metadata.size || 0), 0)
}

// Evict oldest entries until under limit
const evictIfNeeded = (maxSizeBytes: number, reserveBytes: number = 0) => {
  const currentSize = getCacheSizeBytes()
  const targetSize = maxSizeBytes - reserveBytes

  if (currentSize <= targetSize) return

  const entries = getCacheEntries()
  // Sort by cachedAt (oldest first)
  entries.sort((a, b) => a.metadata.cachedAt - b.metadata.cachedAt)

  let freedBytes = 0
  const bytesToFree = currentSize - targetSize

  for (const entry of entries) {
    if (freedBytes >= bytesToFree) break

    try {
      fs.unlinkSync(entry.audioPath)
      fs.unlinkSync(path.join(CACHE_DIR, `${entry.key}.meta.json`))
      freedBytes += entry.metadata.size
      console.log(`[Cache] Evicted: ${entry.key} (${entry.metadata.size} bytes)`)
    } catch (e) {
      console.error(`Error evicting ${entry.key}:`, e)
    }
  }
}

// --- CACHE IPC HANDLERS ---
ipcMain.handle('cache-get', async (_, key: string) => {
  try {
    // NOTE: We intentionally do NOT check if cache is enabled here.
    // This allows existing cached songs to be used even when caching is disabled.
    // The cache-put handler checks the enabled setting to prevent NEW caching.
    const audioPath = path.join(CACHE_DIR, `${key}.audio`)
    if (fs.existsSync(audioPath)) {
      const data = fs.readFileSync(audioPath)
      console.log(`[Cache] HIT: ${key}`)
      return data.buffer
    }
    console.log(`[Cache] MISS: ${key}`)
    return null
  } catch (e) {
    console.error('Cache get error:', e)
    return null
  }
})

ipcMain.handle('cache-put', async (_, key: string, data: ArrayBuffer, metadata: object) => {
  try {
    const settings = getCacheSettings()
    if (!settings.enabled) return false

    ensureCacheDir()
    const maxSizeBytes = settings.maxSizeMB * 1024 * 1024
    const dataSize = data.byteLength

    // Don't cache if single file is larger than max cache
    if (dataSize > maxSizeBytes) {
      console.log(`[Cache] File too large to cache: ${dataSize} bytes`)
      return false
    }

    // Evict old entries to make room
    evictIfNeeded(maxSizeBytes, dataSize)

    const audioPath = path.join(CACHE_DIR, `${key}.audio`)
    const metaPath = path.join(CACHE_DIR, `${key}.meta.json`)

    const fullMetadata: CacheMetadata = {
      trackId: '',
      searchQuery: '',
      ...metadata,
      cachedAt: Date.now(),
      size: dataSize
    }

    fs.writeFileSync(audioPath, Buffer.from(data))
    fs.writeFileSync(metaPath, JSON.stringify(fullMetadata, null, 2))
    console.log(`[Cache] STORED: ${key} (${dataSize} bytes)`)
    return true
  } catch (e) {
    console.error('Cache put error:', e)
    return false
  }
})

ipcMain.handle('cache-delete', async (_, key: string) => {
  try {
    const audioPath = path.join(CACHE_DIR, `${key}.audio`)
    const metaPath = path.join(CACHE_DIR, `${key}.meta.json`)

    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath)
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath)
    console.log(`[Cache] DELETED: ${key}`)
    return true
  } catch (e) {
    console.error('Cache delete error:', e)
    return false
  }
})

ipcMain.handle('cache-clear', async () => {
  try {
    ensureCacheDir()
    const files = fs.readdirSync(CACHE_DIR)
    for (const file of files) {
      fs.unlinkSync(path.join(CACHE_DIR, file))
    }
    console.log('[Cache] CLEARED all entries')
    return true
  } catch (e) {
    console.error('Cache clear error:', e)
    return false
  }
})

ipcMain.handle('cache-stats', async () => {
  try {
    const entries = getCacheEntries()
    const totalSize = entries.reduce((sum, e) => sum + e.metadata.size, 0)
    return {
      count: entries.length,
      sizeBytes: totalSize,
      sizeMB: Math.round((totalSize / (1024 * 1024)) * 100) / 100
    }
  } catch (e) {
    console.error('Cache stats error:', e)
    return { count: 0, sizeBytes: 0, sizeMB: 0 }
  }
})

ipcMain.handle('cache-settings-get', async () => {
  return getCacheSettings()
})

ipcMain.handle('cache-settings-set', async (_, settings: Partial<CacheSettings>) => {
  try {
    const current = getCacheSettings()
    const updated = { ...current, ...settings }
    saveCacheSettings(updated)

    // If max size was reduced, evict excess
    if (updated.enabled && settings.maxSizeMB) {
      evictIfNeeded(updated.maxSizeMB * 1024 * 1024)
    }

    return true
  } catch (e) {
    console.error('Cache settings save error:', e)
    return false
  }
})

// List all cached songs with metadata for offline playback
ipcMain.handle('cache-list', async () => {
  try {
    const entries = getCacheEntries()
    return entries.map((entry) => ({
      key: entry.key,
      trackId: entry.metadata.trackId,
      searchQuery: entry.metadata.searchQuery,
      cachedAt: entry.metadata.cachedAt,
      sizeMB: Math.round((entry.metadata.size / (1024 * 1024)) * 100) / 100
    }))
  } catch (e) {
    console.error('Cache list error:', e)
    return []
  }
})

// --- SONG PREFERENCE SYSTEM ---
// Stores user's preferred audio source for each track
const SONG_PREFS_FILE = path.join(app.getPath('userData'), 'song-preferences.json')

interface SongPreference {
  sourceId: string // YouTube video ID or JioSaavn song ID
  sourceTitle: string
  provider: 'youtube' | 'jiosaavn'
  savedAt: number
}

// Load song preferences
const loadSongPreferences = (): Record<string, SongPreference> => {
  try {
    if (fs.existsSync(SONG_PREFS_FILE)) {
      const data = fs.readFileSync(SONG_PREFS_FILE, 'utf-8')
      return JSON.parse(data)
    }
  } catch (e) { 
    console.error('Error loading song preferences:', e)
  }
  return {}
}

// Save song preferences
const saveSongPreferences = (prefs: Record<string, SongPreference>) => {
  try {
    fs.writeFileSync(SONG_PREFS_FILE, JSON.stringify(prefs, null, 2))
  } catch (e) {
    console.error('Error saving song preferences:', e)
  }
}

// Get preference for a specific track
ipcMain.handle('song-pref-get', async (_, trackKey: string) => {
  try {
    const prefs = loadSongPreferences()
    return prefs[trackKey] || null
  } catch (e) {
    console.error('Song pref get error:', e)
    return null
  }
})

// Set preference for a specific track
ipcMain.handle(
  'song-pref-set',
  async (_, trackKey: string, preference: SongPreference) => {
    try {
      const prefs = loadSongPreferences()
      prefs[trackKey] = {
        ...preference,
        savedAt: Date.now()
      }
      saveSongPreferences(prefs)
      console.log(`[SongPref] Saved preference for: ${trackKey}`)
      return true
    } catch (e) {
      console.error('Song pref set error:', e)
      return false
    }
  }
)

// Delete preference for a specific track
ipcMain.handle('song-pref-delete', async (_, trackKey: string) => {
  try {
    const prefs = loadSongPreferences()
    if (prefs[trackKey]) {
      delete prefs[trackKey]
      saveSongPreferences(prefs)
      console.log(`[SongPref] Deleted preference for: ${trackKey}`)
    }
    return true
  } catch (e) {
    console.error('Song pref delete error:', e)
    return false
  }
})

// Get all preferences (for debugging/settings)
ipcMain.handle('song-pref-list', async () => {
  try {
    return loadSongPreferences()
  } catch (e) {
    console.error('Song pref list error:', e)
    return {}
  }
})

// Clear all preferences
ipcMain.handle('song-pref-clear', async () => {
  try {
    saveSongPreferences({})
    console.log('[SongPref] Cleared all preferences')
    return true
  } catch (e) {
    console.error('Song pref clear error:', e)
    return false
  }
})

// --- LYRICS PREFERENCE SYSTEM ---
// Stores user's preferred lyrics for each track (when auto-fetch gets wrong lyrics)
const LYRICS_PREFS_FILE = path.join(app.getPath('userData'), 'lyrics-preferences.json')

interface LyricsPreference {
  searchQuery: string // The search query used to find these lyrics
  syncedLyrics?: string // LRC format synced lyrics
  plainLyrics?: string // Plain text lyrics
  source?: string // e.g. "LRCLIB manual search"
  savedAt: number
}

// Load lyrics preferences
const loadLyricsPreferences = (): Record<string, LyricsPreference> => {
  try {
    if (fs.existsSync(LYRICS_PREFS_FILE)) {
      const data = fs.readFileSync(LYRICS_PREFS_FILE, 'utf-8')
      return JSON.parse(data)
    }
  } catch (e) {
    console.error('Error loading lyrics preferences:', e)
  }
  return {}
}

// Save lyrics preferences
const saveLyricsPreferences = (prefs: Record<string, LyricsPreference>) => {
  try {
    fs.writeFileSync(LYRICS_PREFS_FILE, JSON.stringify(prefs, null, 2))
  } catch (e) {
    console.error('Error saving lyrics preferences:', e)
  }
}

// Get lyrics preference for a specific track
ipcMain.handle('lyrics-pref-get', async (_, trackKey: string) => {
  try {
    const prefs = loadLyricsPreferences()
    return prefs[trackKey] || null
  } catch (e) {
    console.error('Lyrics pref get error:', e)
    return null
  }
})

// Set lyrics preference for a specific track
ipcMain.handle(
  'lyrics-pref-set',
  async (_, trackKey: string, preference: LyricsPreference) => {
    try {
      const prefs = loadLyricsPreferences()
      prefs[trackKey] = {
        ...preference,
        savedAt: Date.now()
      }
      saveLyricsPreferences(prefs)
      console.log(`[LyricsPref] Saved preference for: ${trackKey}`)
      return true
    } catch (e) {
      console.error('Lyrics pref set error:', e)
      return false
    }
  }
)

// Delete lyrics preference for a specific track
ipcMain.handle('lyrics-pref-delete', async (_, trackKey: string) => {
  try {
    const prefs = loadLyricsPreferences()
    if (prefs[trackKey]) {
      delete prefs[trackKey]
      saveLyricsPreferences(prefs)
      console.log(`[LyricsPref] Deleted preference for: ${trackKey}`)
    }
    return true
  } catch (e) {
    console.error('Lyrics pref delete error:', e)
    return false
  }
})

// --- SAVED PLAYLISTS LIBRARY ---
// Stores playlists that user saves from search to their local library
const SAVED_PLAYLISTS_FILE = path.join(app.getPath('userData'), 'saved-playlists.json')

interface SavedPlaylist {
  id: string
  name: string
  description?: string
  imageUrl?: string
  ownerName?: string
  trackCount?: number
  savedAt: number
}

// Load saved playlists
const loadSavedPlaylists = (): SavedPlaylist[] => {
  try {
    if (fs.existsSync(SAVED_PLAYLISTS_FILE)) {
      const data = fs.readFileSync(SAVED_PLAYLISTS_FILE, 'utf-8')
      return JSON.parse(data)
    }
  } catch (e) {
    console.error('Error loading saved playlists:', e)
  }
  return []
}

// Save playlists to file
const savePlaylists = (playlists: SavedPlaylist[]) => {
  try {
    fs.writeFileSync(SAVED_PLAYLISTS_FILE, JSON.stringify(playlists, null, 2))
  } catch (e) {
    console.error('Error saving playlists:', e)
  }
}

// Get all saved playlists
ipcMain.handle('saved-playlists-get', async () => {
  try {
    return loadSavedPlaylists()
  } catch (e) {
    console.error('Saved playlists get error:', e)
    return []
  }
})

// Add a playlist to library
ipcMain.handle('saved-playlists-add', async (_, playlist: SavedPlaylist) => {
  try {
    const playlists = loadSavedPlaylists()
    // Check if already saved
    if (playlists.some(p => p.id === playlist.id)) {
      console.log(`[Library] Playlist already saved: ${playlist.name}`)
      return true
    }
    playlists.unshift({ ...playlist, savedAt: Date.now() })
    savePlaylists(playlists)
    console.log(`[Library] Added playlist: ${playlist.name}`)
    return true
  } catch (e) {
    console.error('Saved playlists add error:', e)
    return false
  }
})

// Remove a playlist from library
ipcMain.handle('saved-playlists-remove', async (_, playlistId: string) => {
  try {
    const playlists = loadSavedPlaylists()
    const filtered = playlists.filter(p => p.id !== playlistId)
    savePlaylists(filtered)
    console.log(`[Library] Removed playlist: ${playlistId}`)
    return true
  } catch (e) {
    console.error('Saved playlists remove error:', e)
    return false
  }
})

// Check if a playlist is saved
ipcMain.handle('saved-playlists-check', async (_, playlistId: string) => {
  try {
    const playlists = loadSavedPlaylists()
    return playlists.some(p => p.id === playlistId)
  } catch (e) {
    console.error('Saved playlists check error:', e)
    return false
  }
})

// --- SPOTIFY SESSION STORAGE ---
const SPOTIFY_STORAGE_FILE = path.join(app.getPath('userData'), 'spotify-session.json');

interface SpotifySession {
  accessToken: string;
  accessTokenExpirationTimestampMs: number;
  clientId?: string;
  isAnonymous?: boolean;
  spDcCookie: string;
  savedAt: number;
}

const saveSpotifySession = (session: SpotifySession) => {
  try {
    fs.writeFileSync(SPOTIFY_STORAGE_FILE, JSON.stringify(session, null, 2));
    console.log('[Spotify] Session saved');
  } catch (e) {
    console.error('Error saving Spotify session:', e);
  }
};

const loadSpotifySession = (): SpotifySession | null => {
  try {
    if (fs.existsSync(SPOTIFY_STORAGE_FILE)) {
      return JSON.parse(fs.readFileSync(SPOTIFY_STORAGE_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error loading Spotify session:', e);
  }
  return null;
};

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public')

let win: BrowserWindow | null
let tray: Tray | null = null
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

// --- PATH LOGIC ---
const isDev = !app.isPackaged

// In Production: resources/bin/yt-dlp.exe
// In Dev: project-root/bin/yt-dlp.exe
const prodPath = path.join(process.resourcesPath, 'bin', 'yt-dlp.exe')
const devPath = path.join(__dirname, '../bin/yt-dlp.exe')

const ytDlpPath = isDev ? devPath : prodPath

// DEBUG CHECK
if (!isDev && !fs.existsSync(ytDlpPath)) {
  dialog.showErrorBox('Critical Error', `yt-dlp.exe missing at:\n${ytDlpPath}`)
}

// --- SHARED USER-AGENT ---
// CRITICAL: This User-Agent MUST match between yt-dlp and Electron to avoid 403 errors
// YouTube URLs are signed with the User-Agent that requested them
const ELECTRON_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Custom wrapper to run yt-dlp binary directly
 * Bypasses the library to ensure we use the correct .exe path
 */
const runYtDlp = (args: string[]): Promise<any> => {
  return new Promise((resolve, reject) => {
    execFile(ytDlpPath, args, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        console.error('yt-dlp error:', stderr)
        reject(error)
        return
      }
      try {
        const json = JSON.parse(stdout)
        resolve(json)
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError)
        reject(parseError)
      }
    })
  })
}

// --- DOWNLOAD MANAGER VARIABLES ---
const pendingDownloads = new Map<string, { filename: string; saveAs: boolean }>()

function createWindow() {
  // Start HLS Proxy Server
  startProxyServer()
  
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(process.env.VITE_PUBLIC || '', 'electron-vite.svg'),
    autoHideMenuBar: true,
    frame: false, // Frameless window for custom title bar
    titleBarStyle: 'hidden', // Hide native title bar
    titleBarOverlay: {
      // Windows: Show native window controls (minimize, maximize, close) with custom styling
      color: '#121212', // Background color of title bar overlay
      symbolColor: '#ffffff', // Color of window control icons
      height: 40 // Height of the title bar area
    },
    backgroundColor: '#121212',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  })
  win.setMenuBarVisibility(false)

  // Block dev tools shortcuts in production
  if (app.isPackaged) {
    win.webContents.on('before-input-event', (event, input) => {
      // Block F12
      if (input.key === 'F12') {
        event.preventDefault()
      }
      // Block Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
      if (input.control && input.shift && ['I', 'J', 'C'].includes(input.key)) {
        event.preventDefault()
      }
    })
  }

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // HEADER INTERCEPTOR (Prevents "Video Unavailable" and 403 errors)
  // CRITICAL: Sets matching headers for YouTube/GoogleVideo requests to avoid signature mismatch
  win.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.youtube.com/*', '*://*.googlevideo.com/*'] },
    (details, callback) => {
      const { requestHeaders } = details
      Object.keys(requestHeaders).forEach((header) => {
        if (header.toLowerCase() === 'referer' || header.toLowerCase() === 'origin') {
          delete requestHeaders[header]
        }
      })
      requestHeaders['Referer'] = 'https://www.youtube.com/'
      requestHeaders['Origin'] = 'https://www.youtube.com'
      // CRITICAL: User-Agent MUST match what yt-dlp used to generate the URL
      requestHeaders['User-Agent'] = ELECTRON_USER_AGENT
      callback({ requestHeaders })
    }
  )

  // SPOTIFY COOKIE INTERCEPTOR (Allows sp_dc cookie authentication)
  // Chromium normally blocks setting Cookie header from fetch()
  // This interceptor allows it for Spotify's token endpoint
  win.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ['https://open.spotify.com/get_access_token*'] },
    (details, callback) => {
      // Allow the Cookie header that was set in the fetch request
      // No modification needed, just pass through
      callback({ requestHeaders: details.requestHeaders })
    }
  )

  // --- DOWNLOAD HANDLER ---
  win.webContents.session.on('will-download', (event, item, webContents) => {
    const url = item.getURL()
    const options = pendingDownloads.get(url) || { filename: 'audio.mp3', saveAs: false }

    if (options.filename) {
      item.setSavePath(path.join(app.getPath('downloads'), options.filename))
    }

    if (options.saveAs) {
      const result = dialog.showSaveDialogSync(win!, {
        defaultPath: options.filename,
        filters: [{ name: 'Audio Files', extensions: ['mp3', 'm4a'] }]
      })
      if (result) item.setSavePath(result)
      else {
        item.cancel()
        return
      }
    }

    item.on('updated', (event, state) => {
      if (state === 'progressing' && !item.isPaused()) {
        win?.webContents.send('download-progress', {
          url: url,
          progress: item.getReceivedBytes() / item.getTotalBytes(),
          received: item.getReceivedBytes(),
          total: item.getTotalBytes()
        })
      }
    })

    item.on('done', (event, state) => {
      pendingDownloads.delete(url)
      win?.webContents.send('download-complete', {
        url: url,
        state: state,
        path: item.getSavePath()
      })
    })
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.DIST || '', 'index.html'))
  }

  // --- SYSTEM TRAY ---
  if (!tray) {
    // Path resolution
    const publicDir = process.env.VITE_PUBLIC || '';
    const iconIco = path.join(publicDir, 'icon.ico');
    const iconPng = path.join(publicDir, 'icon.png');
    
    console.log('[Tray] Looking for icons at:', { iconIco, iconPng });

    let trayIcon: NativeImage | null = null;

    if (fs.existsSync(iconIco)) {
      console.log('[Tray] Found .ico');
      trayIcon = nativeImage.createFromPath(iconIco);
    } else if (fs.existsSync(iconPng)) {
      console.log('[Tray] Found .png');
      const image = nativeImage.createFromPath(iconPng);
      // Resize to 16x16 for tray if using PNG
      trayIcon = image.resize({ width: 16, height: 16 });
    } else {
      console.log('[Tray] No icon found, using fallback base64');
       // Fallback to simple data URL if all else fails
       const iconDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADfSURBVDiNpZMxDoJAEEXfLhYmFjZewMbGxMQLeBN7C2+gd7Cx9AYcwNLL2GhjZ2dBQmICsptQCJBlJ5Ns8f/szOwfYKG1fkhBLoANsAMiYGcavsLME7AH4tQnhMBDAGugBlrmWQEBsAXutNYnM/8K7A1rlFJlEi+B+H8MEbABbrXWRynnBRb/JQihYg4wBrrm/hxomLlvYEFmDuwDG6BttN4FXGQZEAPXQNnMbcKQKaVKJdADQq31ycRChh4wABpG6x0hjYGhuT8DamYOZv6aWMjLwNDcHwNV8/cBeAe/iyFO7WBXRQAAAABJRU5ErkJggg=='
       trayIcon = nativeImage.createFromDataURL(iconDataUrl);
    }
    
    if (trayIcon) {
       tray = new Tray(trayIcon);
       tray.setToolTip('Ragam Music Player');
       
       const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show App',
        click: () => {
          if (win) {
            win.show()
            win.focus()
          }
        }
      },
      {
        label: 'Minimize to Tray',
        click: () => {
          win?.hide()
        }
      },
      { type: 'separator' },
      {
        label: 'Play/Pause',
        click: () => {
          win?.webContents.send('tray-playpause')
        }
      },
      {
        label: 'Next Track',
        click: () => {
          win?.webContents.send('tray-next')
        }
      },
      {
        label: 'Previous Track',
        click: () => {
          win?.webContents.send('tray-previous')
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit()
        }
      }
    ])

    tray.setContextMenu(contextMenu)
    
    // Double-click tray icon to show window
    tray.on('double-click', () => {
      if (win) {
        win.show()
        win.focus()
      }
    })
    }
  }
}


// ==========================================================
// --- 1. YOUTUBE HANDLERS (Native execFile) ---
// ==========================================================

// --- UPDATED: SEARCH VIDEO (RETURN TOP 5) ---
ipcMain.handle('youtube-search-video', async (_, query) => {
  try {
    console.log(`[YouTube Video Search] Searching: ${query}`)

    // 'ytsearch5:' tells yt-dlp to return the top 5 results
    const args = [
      `ytsearch5:${query}`,
      '--dump-single-json',
      '--flat-playlist', // Get metadata only (fast)
      '--no-warnings',
      '--no-check-certificate'
    ]

    const output = await runYtDlp(args)

    if (!output || !output.entries) {
      return []
    }

    // Map all 5 entries
    return output.entries.map((video: any) => ({
      id: video.id,
      title: video.title,
      thumbnail: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
      channel: video.uploader,
      duration: video.duration
    }))
  } catch (error: any) {
    console.error('[YouTube Video Search] Error:', error)
    return []
  }
})

ipcMain.handle('youtube-search', async (_, query, region = 'US') => {
  try {
    console.log(`[YouTube Music] Searching: ${query} (Region: ${region})`)

    // 1. Construct the YouTube Music Search URL (Scrapes music.youtube.com)
    const searchUrl = `https://music.youtube.com/search?q=${encodeURIComponent(query)}`

    const args = [
      searchUrl,
      '--dump-single-json',
      '--playlist-items',
      '1,2,3,4,5,6,7,8,9,10',
      '--flat-playlist',
      '--no-warnings',
      '--no-check-certificate',
      '--geo-bypass-country',
      region // Apply User Region
    ]

    const output = await runYtDlp(args)

    // yt-dlp returns a Playlist object for search URLs
    if (!output || !output.entries) return []

    return output.entries.map((entry: any) => ({
      id: entry.id,
      title: entry.title,
      channelTitle: entry.uploader || entry.artist || 'YouTube Music',
      duration: entry.duration,
      thumbnail: `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
      artists: [{ name: entry.uploader || entry.artist || 'Unknown' }]
    }))
  } catch (error: any) {
    console.warn('YTM Search failed, falling back to standard ytsearch:', error.message)
    try {
      const fbArgs = [
        query,
        '--dump-single-json',
        '--default-search',
        'ytsearch5:',
        '--flat-playlist',
        '--no-warnings',
        '--no-check-certificate',
        '--geo-bypass-country',
        region
      ]
      const fbOutput = await runYtDlp(fbArgs)

      if (!fbOutput || !fbOutput.entries) return []

      return fbOutput.entries.map((entry: any) => ({
        id: entry.id,
        title: entry.title,
        channelTitle: entry.uploader,
        duration: entry.duration,
        thumbnail: `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
        artists: [{ name: entry.uploader }]
      }))
    } catch (fbError) {
      console.error('Fallback Search Error:', fbError)
      return []
    }
  }
})

ipcMain.handle('youtube-stream', async (_, videoId, quality = 'high') => {
  try {
    console.log(`[YouTube] Fetching Stream for: ${videoId} (Quality: ${quality})`)
    const url = `https://www.youtube.com/watch?v=${videoId}`
    
    // Get all formats to find best audio
    let formatSelector = 'bestaudio/best'
    if (quality === 'medium') {
      formatSelector = 'bestaudio[abr<=128]/bestaudio'
    } else if (quality === 'low') {
      formatSelector = 'worstaudio'
    }

    const args = [
      url,
      '--dump-single-json',
      '--no-warnings',
      '--no-check-certificate',
      '--format', formatSelector
    ]

    const output = await runYtDlp(args)

    if (!output || !output.url) throw new Error('No stream URL found')

    // Return direct YouTube URL (supports seeking via Range headers)
    console.log(`[YouTube] Returning direct audio URL for: ${videoId}`)

    return {
      url: output.url,  // Direct YouTube URL for seeking support
      duration: output.duration,
      title: output.title
    }
  } catch (error: any) {
    console.error('[YouTube] Stream Extraction Error:', error)
    return null
  }
})

// --- NEW HANDLER: GET VIDEO STREAM (HLS SUPPORT) ---
ipcMain.handle('youtube-video-url', async (_, videoId) => {
  try {
    console.log(`[YouTube] Fetching HLS Stream for: ${videoId}`)
    const url = `https://www.youtube.com/watch?v=${videoId}`

    const args = [url, '--dump-single-json', '--no-warnings', '--no-check-certificate']

    const output = await runYtDlp(args)

    let streamUrl = output.manifest_url

    if (!streamUrl && output.formats) {
      const hlsFormat = output.formats.find(
        (f: any) => f.protocol === 'm3u8' || f.protocol === 'm3u8_native'
      )
      if (hlsFormat) {
        streamUrl = hlsFormat.url
      }
    }

    if (!streamUrl) {
      console.log('No HLS found, falling back to MP4')
      const mp4Format = output.formats
        .reverse()
        .find((f: any) => f.ext === 'mp4' && f.acodec !== 'none' && f.vcodec !== 'none')
      streamUrl = mp4Format ? mp4Format.url : output.url
    }

    if (!streamUrl) throw new Error('No video stream found')

    return {
      url: streamUrl,
      title: output.title,
      isHls: streamUrl.includes('.m3u8')
    }
  } catch (error: any) {
    console.error('[YouTube] Video Stream Error:', error)
    return null
  }
})

// --- HANDLER: GET VIDEO STREAM WITH QUALITY SELECTION ---
// Prioritizes HLS for adaptive quality, falls back to muxed MP4
ipcMain.handle('youtube-video-stream', async (_, videoId, maxHeight = 1080) => {
  try {
    console.log(`[YouTube] Fetching Video Stream for: ${videoId} (Max Height: ${maxHeight}p)`)
    const url = `https://www.youtube.com/watch?v=${videoId}`

    // Get all format info without specifying a format
    const args = [
      url,
      '--dump-single-json',
      '--no-warnings',
      '--no-check-certificate',
      '--user-agent', ELECTRON_USER_AGENT
    ]

    const output = await runYtDlp(args)
    if (!output) throw new Error('No data returned from yt-dlp')

    // Strategy 1: Try to get HLS manifest (best for adaptive quality)
    let hlsUrl = output.manifest_url
    
    if (!hlsUrl && output.formats) {
      // Look for HLS format in formats list
      const hlsFormat = output.formats.find(
        (f: any) => f.protocol === 'm3u8' || f.protocol === 'm3u8_native' || 
                    (f.url && f.url.includes('.m3u8'))
      )
      if (hlsFormat) {
        hlsUrl = hlsFormat.url
      }
    }

    if (hlsUrl) {
      console.log(`[YouTube] Found HLS manifest for adaptive quality`)
      const proxyUrl = `http://localhost:${currentProxyPort}/proxy?url=${encodeURIComponent(hlsUrl)}`
      
      return {
        type: 'hls',
        url: proxyUrl,
        isHls: true,
        title: output.title,
        duration: output.duration,
        thumbnail: output.thumbnail,
        qualities: ['auto', '1080p', '720p', '480p', '360p', '240p'] // HLS has all
      }
    }

    // Strategy 2: Use yt-dlp piped streaming (merges video+audio on-the-fly for higher qualities)
    console.log(`[YouTube] No native HLS, using yt-dlp piped streaming`)
    
    // Get ALL video formats (including video-only which yt-dlp will merge with audio)
    // This enables 1080p, 1440p, 4K quality options
    const videoFormats = output.formats
      ?.filter((f: any) => 
        f.vcodec !== 'none' && 
        f.height &&
        f.height >= 144  // Filter out tiny formats
      )
      .sort((a: any, b: any) => (b.height || 0) - (a.height || 0)) || []

    // Get unique quality heights
    const heightSet = new Set<number>(videoFormats.map((f: any) => f.height as number))
    const allHeights: number[] = Array.from(heightSet)
      .filter(h => h && h >= 144)
      .sort((a, b) => b - a)

    if (allHeights.length > 0) {
      // Select best quality up to maxHeight
      const selectedHeight = allHeights.find(h => h <= maxHeight) || allHeights[allHeights.length - 1]
      const availableQualities = allHeights.map(h => `${h}p`)
      
      // Use /stream endpoint for direct yt-dlp piping (merges video+audio on-the-fly)
      const streamUrl = `http://localhost:${currentProxyPort}/stream?id=${videoId}&quality=${selectedHeight}`
      console.log(`[YouTube] Returning ${selectedHeight}p piped stream (${availableQualities.length} qualities: ${availableQualities.slice(0, 5).join(', ')}...)`)
      
      return {
        type: 'muxed',
        url: streamUrl,  // Piped through yt-dlp with on-the-fly merging
        isHls: false,
        height: selectedHeight,
        format: 'webm',
        title: output.title,
        duration: output.duration,
        thumbnail: output.thumbnail,
        qualities: availableQualities
      }
    }

    // Strategy 3: Last resort - try format 22 (720p) or 18 (360p)
    console.log(`[YouTube] No formats available, trying fallback formats 22/18`)
    const fallbackArgs = [
      url,
      '--dump-single-json',
      '--no-warnings',
      '--no-check-certificate',
      '--format', '22/18',
      '--user-agent', ELECTRON_USER_AGENT
    ]
    const fallbackOutput = await runYtDlp(fallbackArgs)
    if (fallbackOutput?.url) {
      const proxyUrl = `http://localhost:${currentProxyPort}/proxy?url=${encodeURIComponent(fallbackOutput.url)}`
      return {
        type: 'muxed',
        url: proxyUrl,
        isHls: false,
        height: fallbackOutput.height || 360,
        format: 'mp4',
        title: fallbackOutput.title,
        duration: fallbackOutput.duration,
        thumbnail: fallbackOutput.thumbnail,
        qualities: [`${fallbackOutput.height || 360}p`]
      }
    }
    
    throw new Error('No video URL found')
  } catch (error: any) {
    console.error('[YouTube] Video Stream Error:', error)
    return null
  }
})

ipcMain.handle('download-start', async (_, { url, filename, saveAs }) => {
  try {
    pendingDownloads.set(url, { filename, saveAs })
    win?.webContents.downloadURL(url)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

// ==========================================================
// --- 2. SPOTIFY AUTH (Using sonic-liberation approach) ---
// ==========================================================

// Updated: spotify-login handler
ipcMain.handle('spotify-login', async () => {
  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: true,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:spotify_login',
        webSecurity: false
      }
    });

    const authSession = authWindow.webContents.session;

    // Block service workers
    authSession.webRequest.onBeforeRequest(
      { urls: ['*://*.spotify.com/*/service-worker.js'] },
      (details, callback) => {
        callback({ cancel: true });
      }
    );

    authWindow.loadURL('https://accounts.spotify.com/en/login');

    let isResolved = false;
    let spDcCookie: string | null = null;

    // Enhanced checkLoginSuccess
    const checkLoginSuccess = async () => {
      if (isResolved || authWindow.isDestroyed()) return;

      try {
        const currentUrl = authWindow.webContents.getURL();

        if (currentUrl.includes('accounts.spotify.com/en/status') || 
            currentUrl.includes('open.spotify.com')) {
          
          // If still on accounts, navigate to open.spotify.com for proper domain/cookies
          if (currentUrl.includes('accounts.spotify.com')) {
            console.log('[Spotify Auth] Redirecting to open.spotify.com');
            authWindow.loadURL('https://open.spotify.com/');
            return; // Wait for next interval
          }

          // Now on open.spotify.com, get sp_dc cookie
          const cookies = await authSession.cookies.get({ 
            name: 'sp_dc', 
            url: 'https://open.spotify.com' 
          });
          if (cookies.length === 0) {
            console.log('[Spotify Auth] No sp_dc cookie yet, retrying...');
            return;
          }

          spDcCookie = cookies[0].value;
          console.log('[Spotify Auth] Got sp_dc cookie, length:', spDcCookie.length);

          // Stop checking
          clearInterval(cookieCheckInterval);

          // Use TOTP auth to get token (bypasses 403 blocking)
          console.log('[Spotify Auth] Using TOTP authentication...');
          try {
            const result = await spotifyAuth.loginWithSpDc(spDcCookie);
            
            if (result.success && result.accessToken) {
              console.log('[Spotify Auth] TOTP login successful');
              
              const session: SpotifySession = {
                accessToken: result.accessToken,
                accessTokenExpirationTimestampMs: result.expiration || (Date.now() + 3600000),
                clientId: '',
                isAnonymous: false,
                spDcCookie: spDcCookie,
                savedAt: Date.now()
              };

              saveSpotifySession(session);
              isResolved = true;
              resolve(session);

              setTimeout(() => {
                if (!authWindow.isDestroyed()) authWindow.close();
              }, 500);
            } else {
              throw new Error(result.error || 'TOTP login failed');
            }
          } catch (authError: any) {
            console.error('[Spotify Auth] TOTP error:', authError);
            reject(new Error(`Token fetch failed: ${authError.message}`));
            authWindow.close();
          }
        }
      } catch (error) {
        console.error('[Spotify Auth] Check error:', error);
      }
    };

    const cookieCheckInterval = setInterval(checkLoginSuccess, 1000);

    authWindow.on('closed', () => {
      clearInterval(cookieCheckInterval);
      if (!isResolved) {
        reject(new Error('Login cancelled by user'));
      }
    });
  });
});

// Updated: spotify-refresh-token handler using TOTP auth
ipcMain.handle('spotify-refresh-token', async (_, storedSpDc?: string) => {
  if (!storedSpDc) {
    const session = loadSpotifySession();
    if (!session) return { success: false, error: 'No stored session' };
    storedSpDc = session.spDcCookie;
  }

  console.log('[Spotify Refresh] Using TOTP authentication...');
  try {
    const result = await spotifyAuth.loginWithSpDc(storedSpDc);
    
    if (result.success && result.accessToken) {
      // Update session file
      const session: SpotifySession = {
        accessToken: result.accessToken,
        accessTokenExpirationTimestampMs: result.expiration || (Date.now() + 3600000),
        clientId: '',
        isAnonymous: false,
        spDcCookie: storedSpDc,
        savedAt: Date.now()
      };
      saveSpotifySession(session);
      
      return {
        success: true,
        accessToken: result.accessToken,
        accessTokenExpirationTimestampMs: result.expiration
      };
    } else {
      return { success: false, error: result.error };
    }
  } catch (e: any) {
    console.error('[Spotify Refresh] TOTP error:', e);
    return { success: false, error: e.message };
  }
});

// Optional: Add a handler to check/load existing session
ipcMain.handle('spotify-check-session', async () => {
  const session = loadSpotifySession();
  if (session && Date.now() < session.accessTokenExpirationTimestampMs) {
    return { success: true, ...session };
  }
  return { success: false };
});

// Optional: Clear session
ipcMain.handle('spotify-logout', async () => {
  if (fs.existsSync(SPOTIFY_STORAGE_FILE)) {
    fs.unlinkSync(SPOTIFY_STORAGE_FILE);
  }
  return { success: true };
});

// --- YOUTUBE MUSIC LOGIN ---
ipcMain.handle('ytmusic-login', async () => {
  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 900,
      height: 700,
      show: true,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:ytmusic_login',
        webSecurity: false
      }
    });

    const authSession = authWindow.webContents.session;
    authWindow.loadURL('https://accounts.google.com/ServiceLogin?service=youtube&continue=https://music.youtube.com/');

    let isResolved = false;

    const checkLoginSuccess = async () => {
      if (isResolved || authWindow.isDestroyed()) return;

      try {
        const currentUrl = authWindow.webContents.getURL();
        const isOnYTMusic = currentUrl.includes('music.youtube.com');

        if (isOnYTMusic) {
          const allCookies = await authSession.cookies.get({ url: 'https://music.youtube.com' });
          const hasSID = allCookies.some(c => c.name === 'SID');
          const hasSAPISID = allCookies.some(c => c.name === 'SAPISID' || c.name === '__Secure-3PAPISID');

          if (hasSID && hasSAPISID) {
            const cookieString = allCookies.map(c => `${c.name}=${c.value}`).join('; ');
            console.log('[YTMusic Auth] Login detected! Cookies:', allCookies.map(c => c.name).join(', '));

            isResolved = true;
            clearInterval(cookieCheckInterval);

            ytmusicAuth.setCookies(cookieString);

            setTimeout(() => {
              if (!authWindow.isDestroyed()) authWindow.close();
            }, 500);

            resolve({ success: true });
          }
        }
      } catch (error) {
        console.error('[YTMusic Auth] Check error:', error);
      }
    };

    const cookieCheckInterval = setInterval(checkLoginSuccess, 2000);

    authWindow.on('closed', () => {
      clearInterval(cookieCheckInterval);
      if (!isResolved) {
        reject(new Error('Login cancelled by user'));
      }
    });
  });
});

initYTMusicHandlers();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  registerThumbProtocol()
  ytmusicAuth.restoreSession()
  initSpotifyHandlers()
  createWindow()
})