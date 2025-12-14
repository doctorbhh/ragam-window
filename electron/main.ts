import { app, BrowserWindow, ipcMain, session, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { execFile } from 'child_process' // Import native executor

// 1. STANDARD CONFIGURATION
app.commandLine.appendSwitch('ignore-certificate-errors')

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public')

let win: BrowserWindow | null
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
      '1,2,3,4,5',
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
// --- 2. SPOTIFY AUTH ---
// ==========================================================

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
    })

    const authSession = authWindow.webContents.session

    authSession.webRequest.onBeforeRequest(
      { urls: ['*://*.spotify.com/*/service-worker.js'] },
      (details, callback) => {
        callback({ cancel: true })
      }
    )

    authWindow.loadURL('https://accounts.spotify.com/en/login')

    let isResolved = false

    const checkCookie = async () => {
      if (isResolved || authWindow.isDestroyed()) return
      try {
        const cookies = await authSession.cookies.get({ name: 'sp_dc' })
        if (cookies.length > 0) {
          const currentUrl = authWindow.webContents.getURL()
          if (currentUrl.includes('accounts.spotify.com')) {
            clearInterval(cookieInterval)
            await authWindow.loadURL('https://open.spotify.com')
          }
        }
      } catch (error) {
        console.error(error)
      }
    }

    const cookieInterval = setInterval(checkCookie, 1000)

    try {
      authWindow.webContents.debugger.attach('1.3')
    } catch (err) {}

    authWindow.webContents.debugger.on('message', async (event, method, params) => {
      if (method === 'Network.responseReceived' && params.response.url.includes('/api/token')) {
        try {
          const res = await authWindow.webContents.debugger.sendCommand('Network.getResponseBody', {
            requestId: params.requestId
          })
          if (res.body) {
            const data = JSON.parse(res.body)
            if (data.accessToken) {
              isResolved = true
              resolve(data)
              setTimeout(() => {
                if (!authWindow.isDestroyed()) authWindow.close()
              }, 500)
            }
          }
        } catch (err) {}
      }
    })
    authWindow.webContents.debugger.sendCommand('Network.enable')

    authWindow.on('closed', () => {
      clearInterval(cookieInterval)
      if (!isResolved) console.log('Auth closed')
    })
  })
})

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

app.whenReady().then(createWindow)
