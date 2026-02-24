import { ipcMain, session } from 'electron'
import * as ytmusicApi from './ytmusicApi'
import * as ytmusicAuth from './ytmusicAuth'

export function initYTMusicHandlers() {
  console.log('[YTMusicHandler] Initializing...')

  ipcMain.handle('ytmusic:is-authenticated', () => {
    return ytmusicAuth.isAuthenticated()
  })

  ipcMain.handle('ytmusic:logout', async () => {
    ytmusicAuth.clearCookies()
    // Also clear the persistent webview partition so re-login is fresh
    try {
      const loginSession = session.fromPartition('persist:ytmusic_login')
      await loginSession.clearStorageData()
    } catch (e) {
      console.error('[YTMusicHandler] Failed to clear webview session:', e)
    }
    return { success: true }
  })

  ipcMain.handle('ytmusic:get-home', async () => {
    try {
      return await ytmusicApi.getHome()
    } catch (error: any) {
      console.error('[YTMusicHandler] get-home error:', error.message)
      throw error
    }
  })

  ipcMain.handle('ytmusic:get-playlists', async () => {
    try {
      return await ytmusicApi.getUserPlaylists()
    } catch (error: any) {
      console.error('[YTMusicHandler] get-playlists error:', error.message)
      throw error
    }
  })

  ipcMain.handle('ytmusic:get-playlist', async (_, playlistId: string) => {
    try {
      return await ytmusicApi.getPlaylistDetails(playlistId)
    } catch (error: any) {
      console.error('[YTMusicHandler] get-playlist error:', error.message)
      throw error
    }
  })

  ipcMain.handle('ytmusic:search', async (_, query: string, options?: { filter?: string, scope?: string, ignoreSpelling?: boolean }) => {
    try {
      return await ytmusicApi.search(query, options?.filter, options?.scope, options?.ignoreSpelling)
    } catch (error: any) {
      console.error('[YTMusicHandler] search error:', error.message)
      throw error
    }
  })

  ipcMain.handle('ytmusic:get-search-suggestions', async (_, query: string, detailedRuns?: boolean) => {
    try {
      return await ytmusicApi.getSearchSuggestions(query, detailedRuns)
    } catch (error: any) {
      console.error('[YTMusicHandler] get-search-suggestions error:', error.message)
      throw error
    }
  })

  ipcMain.handle('ytmusic:get-song', async (_, videoId: string) => {
    try {
      return await ytmusicApi.getSongDetails(videoId)
    } catch (error: any) {
      console.error('[YTMusicHandler] get-song error:', error.message)
      throw error
    }
  })

  ipcMain.handle('ytmusic:get-watch-playlist', async (_, videoId: string, playlistId?: string, radio?: boolean) => {
    try {
      return await ytmusicApi.getWatchPlaylist(videoId, playlistId, 25, radio || false)
    } catch (error: any) {
      console.error('[YTMusicHandler] get-watch-playlist error:', error.message)
      throw error
    }
  })

  ipcMain.handle('ytmusic:get-song-related', async (_, browseId: string) => {
    try {
      return await ytmusicApi.getSongRelated(browseId)
    } catch (error: any) {
      console.error('[YTMusicHandler] get-song-related error:', error.message)
      throw error
    }
  })
}
