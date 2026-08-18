# Technical Reference: RAGAM

This document serves as the technical reference for the IPC endpoints, API methods, and context providers available within the RAGAM Electron application.

## 1. IPC Channels (Main -> Renderer)

The following methods are exposed from the Electron Main Process and can be called securely from the Renderer via `window.electron.ipcRenderer.invoke()`.

### 1.1 Cache & Storage API
- `cache-get(key: string)`: Retrieves the cached audio buffer for a given key.
- `cache-put(key: string, data: ArrayBuffer, metadata: object)`: Caches track data and `metadata`.
- `cache-delete(key: string)`: Deletes a specific cached track.
- `cache-clear()`: Clears the entire audio cache.
- `cache-stats()`: Returns total byte size and track count in cache.
- `cache-settings-get()` / `cache-settings-set(settings)`: Manages cache settings (e.g., maximum size).
- `cache-list()`: Returns all cached songs with metadata for offline rendering.

### 1.2 Spotify API Handlers (`spotifyHandler.ts`)
Proxies queries to the Spotify GraphQL endpoint using a user's stored access tokens.
- `spotify:get-me`: Returns current user info.
- `spotify:get-saved-tracks(limit, offset)`: User's liked songs.
- `spotify:get-my-playlists(limit, offset)`: User's saved playlists.
- `spotify:get-playlist(playlistId)`: Fetch details of a specific playlist.
- `spotify:get-playlist-tracks(playlistId, limit, offset)`: Fetch tracks within a playlist.
- `spotify:get-album(albumId)` & `spotify:get-album-tracks(albumId, offset, limit)`.
- `spotify:get-artist(artistId)` & `spotify:get-artist-top-tracks(artistId)`.
- `spotify:search(query, offset, limit)`: Performs a global search across all Spotify types.

### 1.3 YouTube Music API Handlers (`ytmusicHandler.ts`)
Interacts with the internal YouTube Music API for streams and alternate data.
- `ytmusic:search(query, options)`: Searches YouTube Music (can filter by songs, videos, playlists).
- `ytmusic:get-song(videoId)`: Returns details of a specific YouTube video/song.
- `ytmusic:get-watch-playlist(videoId)`: Retrieves an "Up Next" / Radio queue based on a seed song.
- `ytmusic:get-song-related(browseId)`: Gets related tracks/albums to a song.

## 2. Renderer Context Providers

### 2.1 PlayerContext
Provides global state management for audio playback across the React app.
- **State Properties**:
  - `currentTrack`: The currently loaded track.
  - `queue`: Array of upcoming tracks.
  - `isPlaying`: Boolean reflecting playback status.
  - `volume` / `progress` / `duration`: Audio elements status.
  - `repeatMode` / `shuffle`: Playback modes.
- **Actions**:
  - `play(track)`: Loads and plays a track, initiating the stream proxy logic via `<audio>` source.
  - `pause()`, `next()`, `previous()`, `seek(time)`.
  - `setQueue(tracks)`: Overwrites the current playing queue.

### 2.2 DownloadContext
Manages offline sync background jobs.
- **State Properties**:
  - `downloadQueue`: Tracks currently being fetched and cached.
  - `downloadProgress`: Map of track IDs to partial download progress percentage.
- **Actions**:
  - `downloadTrack(track)`: Queues a track for offline access by calling the `cache-put` IPC handler.
  - `removeDownload(trackId)`: Purges a track from the cache via `cache-delete`.

## 3. Streaming Proxy Details
When `PlayerContext.play(track)` is invoked, it sets the HTML `<audio src="...">` attribute to target the internal server running on `http://localhost:<PROXY_PORT>/audio?id=<YT_VIDEO_ID>`. 

The Main Process HTTP server intercepts this request, spawns `yt-dlp https://www.youtube.com/watch?v=<id> --format bestaudio ...`, and pipes the `stdout` buffer directly to the active HTTP response in chunked format, providing an instantaneous stream to the frontend without heavy pre-downloading.
