import { app, BrowserWindow, ipcMain, session, dialog, Tray, Menu, nativeImage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { execFile } from 'child_process' // Import native executor
import { initPluginHandlers } from './pluginHandler'
import { initSpotifyHandlers } from './spotifyHandler'
import { spotifyAuth } from './spotifyAuth'

// 1. STANDARD CONFIGURATION
app.commandLine.appendSwitch('ignore-certificate-errors')

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
    const settings = getCacheSettings()
    if (!settings.enabled) return null

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
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC || '', 'electron-vite.svg'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  })
  win.setMenuBarVisibility(false)
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // HEADER INTERCEPTOR (Prevents "Video Unavailable")
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
    // Create a simple 16x16 icon programmatically (Electron tray doesn't support SVG on Windows)
    // Using a data URL for a simple music note icon
    const iconDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADfSURBVDiNpZMxDoJAEEXfLhYmFjZewMbGxMQLeBN7C2+gd7Cx9AYcwNLL2GhjZ2dBQmICsptQCJBlJ5Ns8f/szOwfYKG1fkhBLoANsAMiYGcavsLME7AH4tQnhMBDAGugBlrmWQEBsAXutNYnM/8K7A1rlFJlEi+B+H8MEbABbrXWRynnBRb/JQihYg4wBrrm/hxomLlvYEFmDuwDG6BttN4FXGQZEAPXQNnMbcKQKaVKJdADQq31ycRChh4wABpG6x0hjYGhuT8DamYOZv6aWMjLwNDcHwNV8/cBeAe/iyFO7WBXRQAAAABJRU5ErkJggg=='
    
    const trayIcon = nativeImage.createFromDataURL(iconDataUrl)
    
    tray = new Tray(trayIcon)
    tray.setToolTip('Ragam Music Player')

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
      '--format',
      formatSelector,
      '--no-check-certificate'
    ]

    const output = await runYtDlp(args)

    if (!output || !output.url) throw new Error('No stream URL found')

    return {
      url: output.url,
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
  initPluginHandlers()
  initSpotifyHandlers()
  createWindow()
})