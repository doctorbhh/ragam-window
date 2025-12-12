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

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
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
    win.loadFile(path.join(process.env.DIST || '', 'index.html'))
  }
}

// ==========================================================
// --- 1. YOUTUBE HANDLERS (Native execFile) ---
// ==========================================================

ipcMain.handle('youtube-search', async (_, query) => {
  try {
    console.log(`[YouTube] Searching for: ${query}`)

    // Construct args manually
    const args = [
      query,
      '--dump-single-json',
      '--default-search',
      'ytsearch5:',
      '--flat-playlist',
      '--no-warnings'
    ]

    const output = await runYtDlp(args)

    if (!output || !output.entries) return []

    return output.entries.map((entry: any) => ({
      id: entry.id,
      title: entry.title,
      channelTitle: entry.uploader,
      duration: entry.duration,
      thumbnail: entry.thumbnail || `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
      artists: [{ name: entry.uploader }]
    }))
  } catch (error: any) {
    console.error('[YouTube] Search Error:', error)
    if (!isDev) {
      dialog.showErrorBox(
        'Search Error',
        `Failed to run yt-dlp:\n${error.message}\nPath: ${ytDlpPath}`
      )
    }
    return []
  }
})

ipcMain.handle('youtube-stream', async (_, videoId) => {
  try {
    console.log(`[YouTube] Fetching Stream for: ${videoId}`)
    const url = `https://www.youtube.com/watch?v=${videoId}`

    const args = [url, '--dump-single-json', '--no-warnings', '--format', 'bestaudio/best']

    const output = await runYtDlp(args)

    if (!output || !output.url) throw new Error('No stream URL found')

    return {
      url: output.url,
      duration: output.duration,
      title: output.title
    }
  } catch (error: any) {
    console.error('[YouTube] Stream Extraction Error:', error)
    if (!isDev) {
      dialog.showErrorBox(
        'Stream Error',
        `Failed to play song:\n${error.message}\nPath: ${ytDlpPath}`
      )
    }
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
