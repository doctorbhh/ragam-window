import { app, BrowserWindow, ipcMain, session, net } from 'electron'
import path from 'node:path'
import yt from 'yt-dlp-exec'

// 1. STANDARD CONFIGURATION
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

app.commandLine.appendSwitch('ignore-certificate-errors')

// Fix: Ensure these are treated as strings
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public')

let win: BrowserWindow | null
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

// Fix: Calculate path with fallback
const isDev = !app.isPackaged
const ytDlpPath = isDev
  ? path.join(__dirname, '../../bin/yt-dlp.exe')
  : path.join(process.resourcesPath, 'bin/yt-dlp.exe')

const runYtDlp = (url: string, flags: any) => {
  return yt(url, flags, {
    execPath: ytDlpPath
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    // Fix: Handle potential undefined env var
    icon: path.join(process.env.VITE_PUBLIC || '', 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // Fix: Handle potential undefined env var
    win.loadFile(path.join(process.env.DIST || '', 'index.html'))
  }
}

// ==========================================================
// --- 1. YOUTUBE HANDLERS ---
// ==========================================================

ipcMain.handle('youtube-search', async (_, query) => {
  try {
    console.log(`[YouTube] Searching for: ${query}`)

    // Fix: Cast result to 'any' because the library types don't include 'entries' by default
    const output = (await runYtDlp(query, {
      dumpSingleJson: true,
      defaultSearch: 'ytsearch5:',
      flatPlaylist: true,
      noWarnings: true
    })) as any

    if (!output || !output.entries) return []

    return output.entries.map((entry: any) => ({
      id: entry.id,
      title: entry.title,
      channelTitle: entry.uploader,
      duration: entry.duration,
      thumbnail: entry.thumbnail || `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
      artists: [{ name: entry.uploader }]
    }))
  } catch (error) {
    console.error('[YouTube] Search Error:', error)
    return []
  }
})

ipcMain.handle('youtube-stream', async (_, videoId) => {
  try {
    console.log(`[YouTube] Fetching Stream for: ${videoId}`)
    const url = `https://www.youtube.com/watch?v=${videoId}`

    const output = (await runYtDlp(url, {
      dumpSingleJson: true,
      noWarnings: true,
      format: 'bestaudio/best'
    })) as any

    if (!output || !output.url) throw new Error('No stream URL found')

    return {
      url: output.url,
      duration: output.duration,
      title: output.title
    }
  } catch (error) {
    console.error('[YouTube] Stream Extraction Error:', error)
    return null
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
        const cookies = await authSession.cookies.get({
          name: 'sp_dc'
        })

        if (cookies.length > 0) {
          const currentUrl = authWindow.webContents.getURL()

          if (currentUrl.includes('accounts.spotify.com')) {
            console.log('Login Cookie found! Redirecting to Player...')
            clearInterval(cookieInterval)

            await authWindow.loadURL('https://open.spotify.com')
          }
        }
      } catch (error) {
        console.error('Cookie check error:', error)
      }
    }

    const cookieInterval = setInterval(checkCookie, 1000)

    // Setup Network Listener
    try {
      authWindow.webContents.debugger.attach('1.3')
    } catch (err) {
      console.error('Debugger attach failed', err)
    }

    authWindow.webContents.debugger.on('message', async (event, method, params) => {
      if (method === 'Network.responseReceived') {
        const url = params.response.url
        if (url.includes('/api/token')) {
          try {
            const responseBody = await authWindow.webContents.debugger.sendCommand(
              'Network.getResponseBody',
              { requestId: params.requestId }
            )
            if (responseBody.body) {
              const data = JSON.parse(responseBody.body)
              if (data.accessToken) {
                console.log('>>> SUCCESS: Token Sniffed!')
                isResolved = true
                resolve(data)
                setTimeout(() => {
                  if (!authWindow.isDestroyed()) authWindow.close()
                }, 500)
              }
            }
          } catch (err) {
            /* ignore */
          }
        }
      }
    })
    authWindow.webContents.debugger.sendCommand('Network.enable')

    authWindow.on('closed', () => {
      clearInterval(cookieInterval)
      if (!isResolved) console.log('Auth window closed by user')
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
