import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

let ytmusicCookies: string | null = null
let sapisid: string | null = null

function getStoragePath(): string {
  return path.join(app.getPath('userData'), 'ytmusic-session.json')
}

export function setCookies(cookies: string) {
  ytmusicCookies = cookies
  // Extract SAPISID for auth header
  const match = cookies.match(/SAPISID=([^;]+)/)
  sapisid = match ? match[1] : null
  console.log('[YTMusicAuth] Cookies set, SAPISID found:', !!sapisid)
  try {
    fs.writeFileSync(getStoragePath(), JSON.stringify({ cookies }), 'utf-8')
    console.log('[YTMusicAuth] Session saved to disk')
  } catch (err) {
    console.error('[YTMusicAuth] Failed to save session:', err)
  }
}

export function getCookies(): string | null {
  return ytmusicCookies
}

export function getAuthHeader(): string | null {
  if (!sapisid) return null
  const timestamp = Math.floor(Date.now() / 1000)
  const origin = 'https://music.youtube.com'
  const hash = crypto.createHash('sha1').update(`${timestamp} ${sapisid} ${origin}`).digest('hex')
  return `SAPISIDHASH ${timestamp}_${hash}`
}

export function clearCookies() {
  ytmusicCookies = null
  sapisid = null
  console.log('[YTMusicAuth] Session cleared')
  try {
    const storagePath = getStoragePath()
    if (fs.existsSync(storagePath)) {
      fs.unlinkSync(storagePath)
    }
  } catch (err) {
    console.error('[YTMusicAuth] Failed to remove session file:', err)
  }
}

export function isAuthenticated(): boolean {
  return ytmusicCookies !== null && ytmusicCookies.length > 0
}

export function restoreSession(): boolean {
  try {
    const storagePath = getStoragePath()
    if (fs.existsSync(storagePath)) {
      const data = JSON.parse(fs.readFileSync(storagePath, 'utf-8'))
      if (data?.cookies && data.cookies.length > 0) {
        setCookies(data.cookies)
        console.log('[YTMusicAuth] Session restored from disk')
        return true
      }
    }
  } catch (err) {
    console.error('[YTMusicAuth] Failed to restore session:', err)
  }
  return false
}
