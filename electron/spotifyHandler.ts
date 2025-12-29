// electron/spotifyHandler.ts
// IPC handlers for Spotify GraphQL API

import { ipcMain } from 'electron';
import { SpotifyGqlApi } from './spotify/gqlClient';
import { spotifyAuth } from './spotifyAuth';

export function initSpotifyHandlers() {
  console.log('[SpotifyHandler] Initializing...');

  // ============ USER ENDPOINTS ============

  ipcMain.handle('spotify:get-me', async () => {
    try {
      return await SpotifyGqlApi.user.me();
    } catch (error: any) {
      console.error('[SpotifyHandler] get-me error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('spotify:get-saved-tracks', async (_, limit = 20, offset = 0) => {
    try {
      return await SpotifyGqlApi.user.savedTracks(offset, limit);
    } catch (error: any) {
      console.error('[SpotifyHandler] get-saved-tracks error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('spotify:get-my-playlists', async (_, limit = 50, offset = 0) => {
    try {
      return await SpotifyGqlApi.user.savedPlaylists(offset, limit);
    } catch (error: any) {
      console.error('[SpotifyHandler] get-my-playlists error:', error.message);
      throw error;
    }
  });

  // ============ PLAYLIST ENDPOINTS ============

  ipcMain.handle('spotify:get-playlist', async (_, playlistId: string) => {
    try {
      return await SpotifyGqlApi.playlist.get(playlistId);
    } catch (error: any) {
      console.error('[SpotifyHandler] get-playlist error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('spotify:get-playlist-tracks', async (_, playlistId: string, limit = 25, offset = 0) => {
    try {
      return await SpotifyGqlApi.playlist.getTracks(playlistId, offset, limit);
    } catch (error: any) {
      console.error('[SpotifyHandler] get-playlist-tracks error:', error.message);
      throw error;
    }
  });

  // ============ ALBUM ENDPOINTS ============

  ipcMain.handle('spotify:get-album', async (_, albumId: string) => {
    try {
      return await SpotifyGqlApi.album.get(albumId);
    } catch (error: any) {
      console.error('[SpotifyHandler] get-album error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('spotify:get-album-tracks', async (_, albumId: string, offset = 0, limit = 50) => {
    try {
      return await SpotifyGqlApi.album.getTracks(albumId, offset, limit);
    } catch (error: any) {
      console.error('[SpotifyHandler] get-album-tracks error:', error.message);
      throw error;
    }
  });

  // ============ ARTIST ENDPOINTS ============

  ipcMain.handle('spotify:get-artist', async (_, artistId: string) => {
    try {
      return await SpotifyGqlApi.artist.get(artistId);
    } catch (error: any) {
      console.error('[SpotifyHandler] get-artist error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('spotify:get-artist-top-tracks', async (_, artistId: string) => {
    try {
      return await SpotifyGqlApi.artist.getTopTracks(artistId);
    } catch (error: any) {
      console.error('[SpotifyHandler] get-artist-top-tracks error:', error.message);
      throw error;
    }
  });

  // ============ TRACK ENDPOINTS ============

  ipcMain.handle('spotify:get-track', async (_, trackId: string) => {
    try {
      return await SpotifyGqlApi.track.get(trackId);
    } catch (error: any) {
      console.error('[SpotifyHandler] get-track error:', error.message);
      throw error;
    }
  });

  // ============ SEARCH ENDPOINTS ============

  ipcMain.handle('spotify:search', async (_, query: string, offset = 0, limit = 10) => {
    try {
      return await SpotifyGqlApi.search.all(query, offset, limit);
    } catch (error: any) {
      console.error('[SpotifyHandler] search error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('spotify:search-tracks', async (_, query: string, offset = 0, limit = 20) => {
    try {
      return await SpotifyGqlApi.search.tracks(query, offset, limit);
    } catch (error: any) {
      console.error('[SpotifyHandler] search-tracks error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('spotify:search-albums', async (_, query: string, offset = 0, limit = 20) => {
    try {
      return await SpotifyGqlApi.search.albums(query, offset, limit);
    } catch (error: any) {
      console.error('[SpotifyHandler] search-albums error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('spotify:search-artists', async (_, query: string, offset = 0, limit = 20) => {
    try {
      return await SpotifyGqlApi.search.artists(query, offset, limit);
    } catch (error: any) {
      console.error('[SpotifyHandler] search-artists error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('spotify:search-playlists', async (_, query: string, offset = 0, limit = 20) => {
    try {
      return await SpotifyGqlApi.search.playlists(query, offset, limit);
    } catch (error: any) {
      console.error('[SpotifyHandler] search-playlists error:', error.message);
      throw error;
    }
  });

  // ============ LIBRARY MANAGEMENT ============

  ipcMain.handle('spotify:check-saved-tracks', async (_, trackIds: string[]) => {
    try {
      return await SpotifyGqlApi.library.checkSavedTracks(trackIds);
    } catch (error: any) {
      console.error('[SpotifyHandler] check-saved-tracks error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('spotify:save-tracks', async (_, trackIds: string[]) => {
    try {
      return await SpotifyGqlApi.library.saveTracks(trackIds);
    } catch (error: any) {
      console.error('[SpotifyHandler] save-tracks error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('spotify:remove-tracks', async (_, trackIds: string[]) => {
    try {
      return await SpotifyGqlApi.library.removeTracks(trackIds);
    } catch (error: any) {
      console.error('[SpotifyHandler] remove-tracks error:', error.message);
    }
  });

  // ============ BROWSE/HOME ENDPOINTS ============

  ipcMain.handle('spotify:get-home', async (_, limit = 20) => {
    try {
      return await SpotifyGqlApi.browse.home('Asia/Kolkata', limit);
    } catch (error: any) {
      console.error('[SpotifyHandler] get-home error:', error.message);
      throw error;
    }
  });

  // ============ AUTH STATUS ============

  ipcMain.handle('spotify:is-authenticated', async () => {
    return spotifyAuth.isAuthenticated();
  });

  ipcMain.handle('spotify:get-access-token', async () => {
    return spotifyAuth.accessToken;
  });

  console.log('[SpotifyHandler] Initialized');
}
