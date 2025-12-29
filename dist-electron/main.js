"use strict";
const electron = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const child_process = require("child_process");
const https = require("https");
const http = require("http");
const events = require("events");
const path$1 = require("path");
const fs$1 = require("fs");
const crypto = require("crypto");
const PLUGINS_DIR = path.join(electron.app.getPath("userData"), "plugins");
const PLUGIN_SETTINGS_FILE = path.join(electron.app.getPath("userData"), "plugin-settings.json");
const ensurePluginsDir = () => {
  if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  }
};
const loadPluginSettings = () => {
  try {
    if (fs.existsSync(PLUGIN_SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(PLUGIN_SETTINGS_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("[PluginHandler] Error loading settings:", e);
  }
  return { installedPlugins: {} };
};
const savePluginSettings = (settings) => {
  try {
    fs.writeFileSync(PLUGIN_SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error("[PluginHandler] Error saving settings:", e);
  }
};
const downloadFile = (url) => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    }).on("error", reject);
  });
};
const readPluginManifest = (pluginDir) => {
  try {
    const manifestPath = path.join(pluginDir, "plugin.json");
    if (fs.existsSync(manifestPath)) {
      return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    }
  } catch (e) {
    console.error("[PluginHandler] Error reading manifest:", e);
  }
  return null;
};
const initPluginHandlers = () => {
  ensurePluginsDir();
  electron.ipcMain.handle("plugins-list", async () => {
    try {
      ensurePluginsDir();
      const plugins = [];
      const dirs = fs.readdirSync(PLUGINS_DIR);
      for (const dir of dirs) {
        const pluginDir = path.join(PLUGINS_DIR, dir);
        if (fs.statSync(pluginDir).isDirectory()) {
          const manifest = readPluginManifest(pluginDir);
          if (manifest) {
            plugins.push(manifest);
          }
        }
      }
      return plugins;
    } catch (e) {
      console.error("[PluginHandler] List error:", e);
      return [];
    }
  });
  electron.ipcMain.handle("plugins-load-code", async (_, pluginId) => {
    try {
      const pluginDir = path.join(PLUGINS_DIR, pluginId);
      const manifest = readPluginManifest(pluginDir);
      if (!manifest) {
        throw new Error("Plugin manifest not found");
      }
      const entryPath = path.join(pluginDir, manifest.entry);
      if (!fs.existsSync(entryPath)) {
        throw new Error("Plugin entry file not found");
      }
      return fs.readFileSync(entryPath, "utf-8");
    } catch (e) {
      console.error("[PluginHandler] Load code error:", e);
      throw e;
    }
  });
  electron.ipcMain.handle("plugins-install-url", async (_, url) => {
    try {
      console.log("[PluginHandler] Installing from URL:", url);
      const data = await downloadFile(url);
      const tempDir = path.join(electron.app.getPath("temp"), `plugin-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      if (url.endsWith(".js")) {
        const pluginId = path.basename(url, ".js");
        const pluginDir = path.join(PLUGINS_DIR, pluginId);
        fs.mkdirSync(pluginDir, { recursive: true });
        fs.writeFileSync(path.join(pluginDir, "index.js"), data);
        const manifest = {
          id: pluginId,
          name: pluginId,
          version: "1.0.0",
          author: "Unknown",
          description: "Plugin installed from URL",
          type: "metadata",
          entry: "index.js",
          abilities: [],
          apis: ["fetch"]
        };
        fs.writeFileSync(path.join(pluginDir, "plugin.json"), JSON.stringify(manifest, null, 2));
        return { success: true, manifest };
      }
      if (url.endsWith(".json") || url.includes("plugin.json")) {
        const manifest = JSON.parse(data.toString());
        const pluginDir = path.join(PLUGINS_DIR, manifest.id);
        fs.mkdirSync(pluginDir, { recursive: true });
        fs.writeFileSync(path.join(pluginDir, "plugin.json"), data);
        if (manifest.entry) {
          const baseUrl = url.substring(0, url.lastIndexOf("/"));
          const entryUrl = `${baseUrl}/${manifest.entry}`;
          const entryData = await downloadFile(entryUrl);
          fs.writeFileSync(path.join(pluginDir, manifest.entry), entryData);
        }
        return { success: true, manifest };
      }
      return { success: false, error: "Unsupported plugin format" };
    } catch (e) {
      console.error("[PluginHandler] Install URL error:", e);
      return { success: false, error: e.message };
    }
  });
  electron.ipcMain.handle("plugins-install-file", async (_, data, filename) => {
    try {
      console.log("[PluginHandler] Installing from file:", filename);
      const buffer = Buffer.from(data);
      if (filename.endsWith(".js")) {
        const pluginId = path.basename(filename, ".js");
        const pluginDir = path.join(PLUGINS_DIR, pluginId);
        fs.mkdirSync(pluginDir, { recursive: true });
        fs.writeFileSync(path.join(pluginDir, "index.js"), buffer);
        const manifest = {
          id: pluginId,
          name: pluginId,
          version: "1.0.0",
          author: "Unknown",
          description: "Plugin installed from file",
          type: "metadata",
          entry: "index.js",
          abilities: [],
          apis: ["fetch"]
        };
        fs.writeFileSync(path.join(pluginDir, "plugin.json"), JSON.stringify(manifest, null, 2));
        return { success: true, manifest };
      }
      return { success: false, error: "Unsupported file format" };
    } catch (e) {
      console.error("[PluginHandler] Install file error:", e);
      return { success: false, error: e.message };
    }
  });
  electron.ipcMain.handle("plugins-uninstall", async (_, pluginId) => {
    try {
      const pluginDir = path.join(PLUGINS_DIR, pluginId);
      if (fs.existsSync(pluginDir)) {
        fs.rmSync(pluginDir, { recursive: true, force: true });
      }
      const settings = loadPluginSettings();
      delete settings.installedPlugins[pluginId];
      savePluginSettings(settings);
      return true;
    } catch (e) {
      console.error("[PluginHandler] Uninstall error:", e);
      return false;
    }
  });
  electron.ipcMain.handle("plugins-get-settings", async () => {
    return loadPluginSettings();
  });
  electron.ipcMain.handle("plugins-save-settings", async (_, settings) => {
    savePluginSettings(settings);
    return true;
  });
  console.log("[PluginHandler] Initialized");
};
const SESSION_FILE = path$1.join(electron.app.getPath("userData"), "spotify-session.json");
const NUANCE_URL = "https://codeberg.org/sonic-liberation/blubber-junkyard-elitism/raw/branch/main/nuances.json";
class SpotifyAuthEndpoint extends events.EventEmitter {
  _spDc = null;
  _accessToken = null;
  _expiration = 0;
  _nuance = null;
  constructor() {
    super();
    this._loadSession();
  }
  get accessToken() {
    return this._accessToken;
  }
  get expiration() {
    return this._expiration;
  }
  get spDc() {
    return this._spDc;
  }
  _loadSession() {
    try {
      if (fs$1.existsSync(SESSION_FILE)) {
        const data = JSON.parse(fs$1.readFileSync(SESSION_FILE, "utf-8"));
        this._spDc = data.spDcCookie;
        this._accessToken = data.accessToken;
        this._expiration = data.expiration;
        if (this.isAuthenticated()) {
          console.log("[SpotifyAuth] Recovered session from disk");
          this.emit("recovered");
        }
      }
    } catch (error) {
      console.error("[SpotifyAuth] Failed to load session:", error);
    }
  }
  _saveSession() {
    try {
      const session = {
        spDcCookie: this._spDc || "",
        accessToken: this._accessToken || "",
        expiration: this._expiration,
        savedAt: Date.now()
      };
      fs$1.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
    } catch (error) {
      console.error("[SpotifyAuth] Failed to save session:", error);
    }
  }
  isAuthenticated() {
    return !!this._accessToken && this._expiration > Date.now();
  }
  async loginWithSpDc(spDcCookie) {
    try {
      this._spDc = spDcCookie;
      console.log("[SpotifyAuth] Starting TOTP login...");
      if (!this._nuance) {
        await this._fetchNuance();
      }
      const serverTime = await this._getServerTime();
      const totp = this._generateTotp(serverTime);
      console.log(`[SpotifyAuth] Using TOTP v${this._nuance?.v || 0}...`);
      const result = await this._fetchToken(totp);
      if (result.accessToken) {
        this._accessToken = result.accessToken;
        this._expiration = result.accessTokenExpirationTimestampMs || Date.now() + 36e5;
        this._saveSession();
        this.emit("login", { accessToken: this._accessToken });
        console.log("[SpotifyAuth] Login successful!");
        return {
          success: true,
          accessToken: this._accessToken,
          expiration: this._expiration
        };
      } else {
        throw new Error(result.error || "No access token in response");
      }
    } catch (error) {
      console.error("[SpotifyAuth] Login failed:", error.message);
      return { success: false, error: error.message };
    }
  }
  async refreshCredentials() {
    if (!this._spDc) {
      return { success: false, error: "No sp_dc cookie stored" };
    }
    return this.loginWithSpDc(this._spDc);
  }
  logout() {
    this._spDc = null;
    this._accessToken = null;
    this._expiration = 0;
    try {
      if (fs$1.existsSync(SESSION_FILE)) {
        fs$1.unlinkSync(SESSION_FILE);
      }
    } catch {
    }
    this.emit("logout");
  }
  async _fetchNuance() {
    try {
      const fetch = (await Promise.resolve().then(() => require("./index-CCtAWcID.js"))).default;
      const response = await fetch(NUANCE_URL, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch nuance: ${response.status}`);
      }
      const data = await response.json();
      data.sort((a, b) => (b.v || 0) - (a.v || 0));
      const latest = data[0];
      if (latest && latest.s) {
        this._nuance = { v: latest.v || 1, s: latest.s };
        console.log(`[SpotifyAuth] Nuance fetched: v${this._nuance.v}`);
      } else {
        throw new Error("Invalid nuance format");
      }
    } catch (error) {
      console.warn("[SpotifyAuth] Nuance fetch failed, using fallback:", error.message);
      this._nuance = { v: 5, s: "GVPZVYTFNAZ27PYEXKQ7X5YAFGC3CHBD" };
    }
  }
  async _getServerTime() {
    try {
      const fetch = (await Promise.resolve().then(() => require("./index-CCtAWcID.js"))).default;
      const response = await fetch("https://open.spotify.com/api/server-time", {
        headers: {
          "Cookie": `sp_dc=${this._spDc}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      if (response.ok) {
        const data = await response.json();
        return data.serverTime || Math.floor(Date.now() / 1e3);
      }
    } catch {
    }
    return Math.floor(Date.now() / 1e3);
  }
  _generateTotp(serverTimeSeconds) {
    const secret = this._nuance?.s || "GVPZVYTFNAZ27PYEXKQ7X5YAFGC3CHBD";
    const timeStep = Math.floor(serverTimeSeconds / 30);
    const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (const char of secret.toUpperCase()) {
      const idx = base32Chars.indexOf(char);
      if (idx >= 0) {
        bits += idx.toString(2).padStart(5, "0");
      }
    }
    const keyBytes = Buffer.alloc(Math.floor(bits.length / 8));
    for (let i = 0; i < keyBytes.length; i++) {
      keyBytes[i] = parseInt(bits.substring(i * 8, (i + 1) * 8), 2);
    }
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigInt64BE(BigInt(timeStep));
    const hmac = crypto.createHmac("sha1", keyBytes);
    hmac.update(timeBuffer);
    const hash = hmac.digest();
    const offset = hash[hash.length - 1] & 15;
    const code = (hash[offset] & 127) << 24 | (hash[offset + 1] & 255) << 16 | (hash[offset + 2] & 255) << 8 | hash[offset + 3] & 255;
    return (code % 1e6).toString().padStart(6, "0");
  }
  async _fetchToken(totp) {
    const totpVer = this._nuance?.v || 5;
    const url = `https://open.spotify.com/api/token?reason=transport&productType=web-player&totp=${totp}&totpServer=${totp}&totpVer=${totpVer}`;
    console.log(`[SpotifyAuth] Fetching token from: /api/token?...totpVer=${totpVer}`);
    return new Promise((resolve, reject) => {
      const request = electron.net.request({
        method: "GET",
        url,
        useSessionCookies: false
      });
      request.setHeader("Cookie", `sp_dc=${this._spDc}`);
      request.setHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
      request.setHeader("Accept", "application/json");
      request.setHeader("Accept-Language", "en-US,en;q=0.9");
      request.setHeader("Referer", "https://open.spotify.com/");
      request.setHeader("Origin", "https://open.spotify.com");
      let responseData = "";
      request.on("response", (response) => {
        if (response.statusCode !== 200) {
          let errorText = "";
          response.on("data", (chunk) => {
            errorText += chunk.toString();
          });
          response.on("end", () => {
            console.error("[SpotifyAuth] Token error:", response.statusCode, errorText.substring(0, 200));
            reject(new Error(`Token fetch failed: HTTP ${response.statusCode}`));
          });
          return;
        }
        response.on("data", (chunk) => {
          responseData += chunk.toString();
        });
        response.on("end", () => {
          try {
            const data = JSON.parse(responseData);
            if (data.accessToken) {
              console.log("[SpotifyAuth] Got access token, length:", data.accessToken.length);
            }
            resolve(data);
          } catch (e) {
            reject(new Error("Failed to parse token response"));
          }
        });
      });
      request.on("error", (error) => {
        reject(error);
      });
      request.end();
    });
  }
}
const spotifyAuth = new SpotifyAuthEndpoint();
const GQL_ENDPOINT = "https://api-partner.spotify.com/pathfinder/v1/query";
const API_ENDPOINT = "https://api.spotify.com/v1";
const HASHES = {
  profileAttributes: "53bcb064f6cd18c23f752bc324a791194d20df612d8e1239c735144ab0399ced",
  fetchLibraryTracks: "087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240",
  libraryV3: "2de10199b2441d6e4ae875f27d2db361020c399fb10b03951120223fbed10b08",
  fetchPlaylist: "bb67e0af06e8d6f52b531f97468ee4acd44cd0f82b988e15c2ea47b1148efc77",
  getTrack: "612585ae06ba435ad26369870deaae23b5c8800a256cd8a57e08eddc25a37294",
  queryArtistOverview: "446130b4a0aa6522a686aafccddb0ae849165b5e0436fd802f96e0243617b5d8",
  searchDesktop: "4801118d4a100f756e833d33984436a3899cff359c532f8fd3aaf174b60b3b49",
  searchTracks: "bc1ca2fcd0ba1013a0fc88e6cc4f190af501851e3dafd3e1ef85840297694428",
  searchAlbums: "a71d2c993fc98e1c880093738a55a38b57e69cc4ce5a8c113e6c5920f9513ee2",
  isCurated: "e4ed1f91a2cc5415befedb85acf8671dc1a4bf3ca1a5b945a6386101a22e28a6",
  addToLibrary: "a3c1ff58e6a36fec5fe1e3a193dc95d9071d96b9ba53c5ba9c1494fb1ee73915",
  removeFromLibrary: "a3c1ff58e6a36fec5fe1e3a193dc95d9071d96b9ba53c5ba9c1494fb1ee73915",
  home: "d62af2714f2623c923cc9eeca4b9545b4363abaa9188a9e94e2b63b823419a2c"
};
async function gqlRequest(operationName, hash, variables = {}) {
  const accessToken = spotifyAuth.accessToken;
  if (!accessToken) {
    throw new Error("Not authenticated");
  }
  const body = JSON.stringify({
    variables,
    operationName,
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: hash
      }
    }
  });
  return new Promise((resolve, reject) => {
    const request = electron.net.request({
      method: "POST",
      url: GQL_ENDPOINT
    });
    request.setHeader("Authorization", `Bearer ${accessToken}`);
    request.setHeader("Content-Type", "application/json");
    request.setHeader("Accept", "application/json");
    request.setHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    let responseData = "";
    request.on("response", (response) => {
      response.on("data", (chunk) => {
        responseData += chunk.toString();
      });
      response.on("end", () => {
        try {
          const data = JSON.parse(responseData);
          if (data.errors) {
            console.error("[GQL] Error:", data.errors[0]?.message);
            reject(new Error(data.errors[0]?.message || "GraphQL error"));
          } else {
            resolve(data);
          }
        } catch (e) {
          reject(new Error("Failed to parse GraphQL response"));
        }
      });
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}
async function apiRequest(endpoint, retries = 3) {
  const accessToken = spotifyAuth.accessToken;
  if (!accessToken) {
    throw new Error("Not authenticated");
  }
  return new Promise((resolve, reject) => {
    const request = electron.net.request({
      method: "GET",
      url: `${API_ENDPOINT}${endpoint}`
    });
    request.setHeader("Authorization", `Bearer ${accessToken}`);
    request.setHeader("Accept", "application/json");
    let responseData = "";
    request.on("response", (response) => {
      response.on("data", (chunk) => {
        responseData += chunk.toString();
      });
      response.on("end", () => {
        try {
          if (response.statusCode === 429 && retries > 0) {
            const retryAfter = parseInt(response.headers["retry-after"] || "1", 10);
            console.warn(`[API] Rate Limited (429). Retrying after ${retryAfter}s...`);
            setTimeout(() => {
              apiRequest(endpoint, retries - 1).then(resolve).catch(reject);
            }, retryAfter * 1e3);
            return;
          }
          const data = JSON.parse(responseData);
          if (data.error) {
            if (data.error.status === 429 && retries > 0) {
              console.warn(`[API] Rate Limited (JSON 429). Retrying...`);
              setTimeout(() => {
                apiRequest(endpoint, retries - 1).then(resolve).catch(reject);
              }, 2e3);
              return;
            }
            console.error("[API] Request failed:", data.error);
            reject(new Error(data.error.message || `API Error ${data.error.status}`));
            return;
          }
          resolve(data);
        } catch (e) {
          reject(new Error("Failed to parse API response"));
        }
      });
    });
    request.on("error", (err) => {
      console.error("[API] Network Error:", err);
      reject(err);
    });
    request.end();
  });
}
async function getMe() {
  const result = await gqlRequest("profileAttributes", HASHES.profileAttributes, {});
  const user = result.data?.me?.profile;
  if (!user) throw new Error("Failed to get user profile");
  const userId = user.uri?.split(":").pop();
  return {
    id: userId,
    display_name: user.name,
    email: "unknown",
    images: user.avatar?.sources || [],
    uri: user.uri,
    external_urls: { spotify: `https://open.spotify.com/user/${userId}` },
    type: "user"
  };
}
async function getSavedTracks(offset = 0, limit = 20) {
  const result = await gqlRequest("fetchLibraryTracks", HASHES.fetchLibraryTracks, { offset, limit });
  const library = result.data?.me?.library;
  if (!library) throw new Error("Failed to get saved tracks");
  const tracks = library.tracks?.items?.map((item) => {
    const track = item.track?.data;
    if (!track) return null;
    const id = item.track?._uri?.split(":").pop();
    const artists = track.artists?.items?.map((artist) => {
      const artistId = artist.uri?.split(":").pop();
      return {
        id: artistId,
        name: artist.profile?.name,
        uri: artist.uri,
        external_urls: { spotify: `https://open.spotify.com/artist/${artistId}` }
      };
    }) || [];
    const albumId = track.albumOfTrack?.uri?.split(":").pop();
    const trackDuration = track.duration?.totalMilliseconds || 0;
    return {
      track: {
        id,
        name: track.name,
        uri: `spotify:track:${id}`,
        duration_ms: trackDuration,
        artists,
        album: {
          id: albumId,
          name: track.albumOfTrack?.name,
          images: track.albumOfTrack?.coverArt?.sources || [],
          external_urls: { spotify: `https://open.spotify.com/album/${albumId}` }
        },
        external_urls: { spotify: `https://open.spotify.com/track/${id}` }
      }
    };
  }).filter(Boolean) || [];
  return {
    items: tracks,
    total: library.tracks?.totalCount || 0,
    offset,
    limit,
    next: tracks.length === limit ? `offset=${offset + limit}` : null
  };
}
async function getSavedPlaylists(offset = 0, limit = 20) {
  const result = await gqlRequest("libraryV3", HASHES.libraryV3, {
    filters: ["Playlists"],
    order: null,
    textFilter: "",
    features: ["LIKED_SONGS", "YOUR_EPISODES_V2", "PRERELEASES", "EVENTS"],
    limit,
    offset,
    flatten: false,
    expandedFolders: [],
    folderUri: null,
    includeFoldersWhenFlattening: true
  });
  const libraryData = result.data?.me?.libraryV3;
  if (!libraryData) throw new Error("Failed to get playlists");
  const items = libraryData.items?.filter(
    (item) => item.item?.__typename === "PlaylistResponseWrapper" && item.item?.data?.__typename === "Playlist"
  ).map((item) => {
    const id = item.item?._uri?.split(":").pop();
    const playlist = item.item?.data;
    const owner = playlist?.ownerV2?.data;
    return {
      id,
      name: playlist?.name,
      description: playlist?.description,
      images: playlist?.images?.items?.flatMap((img) => img.sources) || [],
      uri: item.item?._uri,
      external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
      owner: {
        id: owner?.id,
        display_name: owner?.name,
        uri: owner?.uri,
        images: owner?.avatar?.sources || []
      },
      tracks: { total: 0 }
      // Will be filled when fetching playlist details
    };
  }) || [];
  return {
    items,
    total: libraryData.totalCount || 0,
    offset: libraryData.pagingInfo?.offset || offset,
    limit: libraryData.pagingInfo?.limit || limit
  };
}
async function getPlaylist(playlistId) {
  const result = await gqlRequest("fetchPlaylist", HASHES.fetchPlaylist, {
    uri: `spotify:playlist:${playlistId}`,
    offset: 0,
    limit: 25,
    enableWatchFeedEntrypoint: true
  });
  const playlist = result.data?.playlistV2;
  if (!playlist) throw new Error("Failed to get playlist");
  const owner = playlist.ownerV2?.data;
  return {
    id: playlistId,
    name: playlist.name,
    description: playlist.description,
    collaborative: (playlist.members?.items?.length || 0) > 1,
    public: true,
    images: playlist.images?.items?.[0]?.sources || [],
    uri: `spotify:playlist:${playlistId}`,
    external_urls: { spotify: `https://open.spotify.com/playlist/${playlistId}` },
    owner: {
      id: owner?.uri?.split(":").pop(),
      display_name: owner?.name,
      uri: owner?.uri,
      images: owner?.avatar?.sources || []
    },
    followers: playlist.followers,
    tracks: {
      total: playlist.content?.totalCount || 0
    }
  };
}
async function getPlaylistTracks(playlistId, offset = 0, limit = 25) {
  const result = await gqlRequest("fetchPlaylist", HASHES.fetchPlaylist, {
    uri: `spotify:playlist:${playlistId}`,
    offset,
    limit,
    enableWatchFeedEntrypoint: false
  });
  const playlist = result.data?.playlistV2;
  if (!playlist) throw new Error("Failed to get playlist tracks");
  const tracks = playlist.content?.items?.map((trackWrapper) => {
    const item = trackWrapper.itemV2?.data;
    if (!item) return null;
    if (Math.random() < 0.05) {
      console.log("[GQL] Playlist Track Item Keys:", Object.keys(item));
      console.log("[GQL] Playlist Track Duration:", JSON.stringify(item.duration));
    }
    const trackId = item.uri?.split(":").pop();
    const trackArtists = item.artists?.items?.map((artist) => {
      const artistId = artist.uri?.split(":").pop();
      return {
        id: artistId,
        uri: artist.uri,
        name: artist.profile?.name,
        external_urls: { spotify: `https://open.spotify.com/artist/${artistId}` }
      };
    }) || [];
    const albumId = item.albumOfTrack?.uri?.split(":").pop();
    const durationMs = item.duration?.totalMilliseconds || item.trackDuration?.totalMilliseconds || 0;
    return {
      id: trackId,
      uri: item.uri,
      name: item.name,
      album: {
        album_type: "album",
        id: albumId,
        name: item.albumOfTrack?.name,
        images: item.albumOfTrack?.coverArt?.sources || [],
        external_urls: { spotify: `https://open.spotify.com/album/${albumId}` },
        artists: [trackArtists[0]]
      },
      artists: trackArtists,
      duration_ms: durationMs,
      external_urls: { spotify: `https://open.spotify.com/track/${trackId}` }
    };
  }).filter(Boolean) || [];
  return {
    items: tracks.map((track) => ({ track })),
    // Wrap in { track } for compatibility
    total: playlist.content?.totalCount || 0,
    offset,
    limit,
    next: tracks.length === limit ? `offset=${offset + limit}` : null
  };
}
async function searchAll(query, offset = 0, limit = 10) {
  const result = await gqlRequest("searchDesktop", HASHES.searchDesktop, {
    searchTerm: query,
    offset,
    limit,
    numberOfTopResults: 5,
    includeAudiobooks: false,
    includeArtistHasConcertsField: false,
    includePreReleases: false,
    includeLocalConcertsField: false,
    includeAuthors: false
  });
  const searchData = result.data?.searchV2;
  if (!searchData) throw new Error("Search failed");
  return {
    tracks: convertSearchTracks(searchData.tracksV2?.items || []),
    albums: convertSearchAlbums(searchData.albumsV2?.items || []),
    artists: convertSearchArtists(searchData.artists?.items || []),
    playlists: convertSearchPlaylists(searchData.playlists?.items || [])
  };
}
async function searchTracks(query, offset = 0, limit = 20) {
  const result = await gqlRequest("searchTracks", HASHES.searchTracks, {
    searchTerm: query,
    offset,
    limit,
    numberOfTopResults: 20,
    includeAudiobooks: true,
    includeAuthors: false,
    includePreReleases: false
  });
  const searchData = result.data?.searchV2?.tracksV2;
  if (!searchData) throw new Error("Track search failed");
  return {
    tracks: { items: convertSearchTracks(searchData.items || []) },
    total: searchData.totalCount || 0,
    offset: searchData.pagingInfo?.nextOffset || offset,
    limit: searchData.pagingInfo?.limit || limit
  };
}
async function searchAlbums(query, offset = 0, limit = 20) {
  const result = await gqlRequest("searchAlbums", HASHES.searchAlbums, {
    searchTerm: query,
    offset,
    limit,
    numberOfTopResults: 20,
    includeAudiobooks: false,
    includeAuthors: false,
    includePreReleases: false
  });
  const searchData = result.data?.searchV2?.albumsV2;
  if (!searchData) throw new Error("Album search failed");
  return {
    albums: { items: convertSearchAlbums(searchData.items || []) },
    total: searchData.totalCount || 0,
    offset: searchData.pagingInfo?.nextOffset || offset,
    limit: searchData.pagingInfo?.limit || limit
  };
}
async function getAlbum(albumId) {
  console.log("[API] getAlbum called via REST for:", albumId);
  const album = await apiRequest(`/albums/${albumId}`);
  if (!album) {
    console.error("[API] getAlbum returned null/undefined");
    throw new Error("Failed to get album");
  }
  console.log("[API] Album keys:", Object.keys(album));
  if (album.tracks) {
    console.log("[API] Album tracks keys:", Object.keys(album.tracks));
    console.log("[API] Album tracks items type:", Array.isArray(album.tracks.items) ? "Array" : typeof album.tracks.items);
  } else {
    console.error("[API] album.tracks is MISSING!");
    console.log("[API] Full album dump:", JSON.stringify(album));
  }
  const artists = album.artists?.map((artist) => ({
    id: artist.id,
    name: artist.name,
    uri: artist.uri,
    external_urls: artist.external_urls,
    externalUri: artist.external_urls?.spotify
    // Compat
  })) || [];
  const tracks = album.tracks?.items?.map((track) => ({
    id: track.id,
    name: track.name,
    uri: track.uri,
    track_number: track.track_number,
    duration_ms: track.duration_ms,
    explicit: track.explicit,
    artists: track.artists?.map((a) => ({
      id: a.id,
      name: a.name,
      uri: a.uri,
      external_urls: a.external_urls
    })) || [],
    external_urls: track.external_urls,
    externalUri: track.external_urls?.spotify,
    // Compat
    album: {
      id: album.id,
      name: album.name,
      images: album.images
    }
  })) || [];
  return {
    id: album.id,
    name: album.name,
    album_type: album.album_type,
    label: album.label,
    release_date: album.release_date,
    release_date_precision: album.release_date_precision,
    images: album.images || [],
    artists,
    external_urls: { spotify: `https://open.spotify.com/album/${album.id}` },
    externalUri: `https://open.spotify.com/album/${album.id}`,
    // Compat
    tracks: {
      items: tracks,
      total: album.tracks?.total || 0
    }
  };
}
async function getAlbumTracks(albumId, offset = 0, limit = 50) {
  console.log(`[API] getAlbumTracks called for: ${albumId} offset=${offset}`);
  const data = await apiRequest(`/albums/${albumId}/tracks?offset=${offset}&limit=${limit}`);
  if (!data) {
    console.error("[API] getAlbumTracks returned null");
    throw new Error("Failed to get album tracks");
  }
  const tracks = data.items?.map((track) => ({
    id: track.id,
    name: track.name,
    uri: track.uri,
    duration_ms: track.duration_ms,
    explicit: track.explicit,
    artists: track.artists?.map((a) => ({
      id: a.id,
      name: a.name,
      uri: a.uri,
      external_urls: a.external_urls,
      externalUri: a.external_urls?.spotify
      // Compat
    })) || [],
    external_urls: track.external_urls,
    externalUri: track.external_urls?.spotify,
    // Compat
    album: { id: albumId }
  })) || [];
  return {
    items: tracks,
    total: data.total || 0,
    offset: data.offset || offset,
    limit: data.limit || limit,
    next: data.next ? `offset=${offset + limit}` : null
  };
}
async function getArtist(artistId) {
  const result = await gqlRequest("queryArtistOverview", HASHES.queryArtistOverview, {
    uri: `spotify:artist:${artistId}`,
    locale: ""
  });
  const artist = result.data?.artistUnion;
  if (!artist) throw new Error("Failed to get artist");
  return {
    id: artistId,
    name: artist.profile?.name,
    uri: `spotify:artist:${artistId}`,
    images: artist.visuals?.avatarImage?.sources || [],
    followers: { total: artist.stats?.followers || 0 },
    external_urls: { spotify: `https://open.spotify.com/artist/${artistId}` }
  };
}
async function getArtistTopTracks(artistId) {
  const result = await gqlRequest("queryArtistOverview", HASHES.queryArtistOverview, {
    uri: `spotify:artist:${artistId}`,
    locale: ""
  });
  const artist = result.data?.artistUnion;
  if (!artist) throw new Error("Failed to get artist top tracks");
  const tracks = artist.discography?.topTracks?.items?.map((item) => {
    const track = item.track;
    if (!track) return null;
    const id = track.uri?.split(":").pop();
    const artists = track.artists?.items?.map((a) => {
      const artistId2 = a.uri?.split(":").pop();
      return {
        id: artistId2,
        name: a.profile?.name,
        uri: a.uri,
        external_urls: { spotify: `https://open.spotify.com/artist/${artistId2}` }
      };
    }) || [];
    const albumId = track.albumOfTrack?.uri?.split(":").pop();
    return {
      id,
      name: track.name,
      uri: track.uri,
      duration_ms: track.duration?.totalMilliseconds,
      artists,
      album: {
        id: albumId,
        name: track.albumOfTrack?.name,
        images: track.albumOfTrack?.coverArt?.sources || [],
        external_urls: { spotify: `https://open.spotify.com/album/${albumId}` }
      },
      external_urls: { spotify: `https://open.spotify.com/track/${id}` }
    };
  }).filter(Boolean) || [];
  return { tracks };
}
async function getTrack(trackId) {
  const result = await gqlRequest("getTrack", HASHES.getTrack, {
    uri: `spotify:track:${trackId}`
  });
  const track = result.data?.trackUnion;
  if (!track) throw new Error("Failed to get track");
  const allArtists = [
    ...track.firstArtist?.items || [],
    ...track.otherArtists?.items || []
  ];
  const artists = allArtists.map((artist) => {
    const id = artist.uri?.split(":").pop();
    return {
      id,
      name: artist.profile?.name,
      uri: artist.uri,
      external_urls: { spotify: `https://open.spotify.com/artist/${id}` }
    };
  });
  const albumId = track.albumOfTrack?.uri?.split(":").pop();
  return {
    id: track.id,
    name: track.name,
    uri: track.uri,
    duration_ms: track.duration?.totalMilliseconds,
    artists,
    album: {
      id: albumId || track.albumOfTrack?.id,
      name: track.albumOfTrack?.name,
      images: track.albumOfTrack?.coverArt?.sources || [],
      album_type: track.albumOfTrack?.type?.toLowerCase(),
      release_date: track.albumOfTrack?.date?.isoString,
      external_urls: { spotify: `https://open.spotify.com/album/${albumId}` }
    },
    external_urls: { spotify: `https://open.spotify.com/track/${track.id}` }
  };
}
async function checkSavedTracks(trackIds) {
  const result = await gqlRequest("isCurated", HASHES.isCurated, {
    uris: trackIds.map((id) => `spotify:track:${id}`)
  });
  const lookup = result.data?.lookup || [];
  return lookup.filter((item) => item.data?.__typename === "Track").map((item) => item.data?.isCurated || false);
}
async function saveTracks(trackIds) {
  return gqlRequest("addToLibrary", HASHES.addToLibrary, {
    uris: trackIds.map((id) => `spotify:track:${id}`)
  });
}
async function removeTracks(trackIds) {
  return gqlRequest("removeFromLibrary", HASHES.removeFromLibrary, {
    uris: trackIds.map((id) => `spotify:track:${id}`)
  });
}
async function getHome(timeZone = "Asia/Kolkata", limit = 20) {
  const result = await gqlRequest("home", HASHES.home, {
    timeZone,
    sp_t: "",
    facet: "",
    sectionItemsLimit: limit
  });
  const homeData = result.data?.home;
  if (!homeData) return [];
  const sections = homeData.sectionContainer?.sections?.items || [];
  return sections.filter(
    (section) => section.data?.__typename === "HomeGenericSectionData" && section.sectionItems?.items?.length > 0
  ).map((section) => {
    const id = section.uri?.split(":").pop();
    const items = section.sectionItems?.items?.map((item) => {
      const wrapperType = item.content?.__typename;
      const contentType = item.content?.data?.__typename;
      if (wrapperType === "PlaylistResponseWrapper" && contentType === "Playlist") {
        const playlist = item.content.data;
        const playlistId = playlist.uri?.split(":").pop();
        const owner = playlist.ownerV2?.data;
        return {
          type: "playlist",
          id: playlistId,
          name: playlist.name,
          description: playlist.description,
          images: playlist.images?.items?.flatMap((img) => img.sources) || [],
          uri: playlist.uri,
          external_urls: { spotify: `https://open.spotify.com/playlist/${playlistId}` },
          owner: {
            id: owner?.uri?.split(":").pop(),
            display_name: owner?.name
          }
        };
      } else if (wrapperType === "AlbumResponseWrapper" && contentType === "Album") {
        const album = item.content.data;
        const albumId = album.uri?.split(":").pop();
        return {
          type: "album",
          id: albumId,
          name: album.name,
          album_type: album.albumType?.toLowerCase(),
          images: album.coverArt?.sources || [],
          uri: album.uri,
          external_urls: { spotify: `https://open.spotify.com/album/${albumId}` },
          artists: album.artists?.items?.map((artist) => ({
            id: artist.uri?.split(":").pop(),
            name: artist.profile?.name
          })) || []
        };
      } else if (wrapperType === "ArtistResponseWrapper" && contentType === "Artist") {
        const artist = item.content.data;
        const artistId = artist.uri?.split(":").pop();
        return {
          type: "artist",
          id: artistId,
          name: artist.profile?.name,
          images: artist.visuals?.avatarImage?.sources || [],
          uri: artist.uri,
          external_urls: { spotify: `https://open.spotify.com/artist/${artistId}` }
        };
      }
      return null;
    }).filter(Boolean) || [];
    return {
      id,
      title: section.data?.title?.transformedLabel || "Section",
      items
    };
  }).filter((section) => section.items?.length > 0);
}
function convertSearchTracks(items) {
  return items.filter(
    (item) => item.item?.__typename === "TrackResponseWrapper" && item.item?.data?.__typename === "Track"
  ).map((item) => {
    const track = item.item.data;
    const id = track.uri?.split(":").pop();
    const artists = track.artists?.items?.map((artist) => {
      const artistId = artist.uri?.split(":").pop();
      return {
        id: artistId,
        name: artist.profile?.name,
        uri: artist.uri,
        external_urls: { spotify: `https://open.spotify.com/artist/${artistId}` }
      };
    }) || [];
    const albumId = track.albumOfTrack?.uri?.split(":").pop();
    return {
      id,
      name: track.name,
      uri: track.uri,
      duration_ms: track.duration?.totalMilliseconds,
      artists,
      album: {
        id: albumId,
        name: track.albumOfTrack?.name,
        images: track.albumOfTrack?.coverArt?.sources || [],
        external_urls: { spotify: `https://open.spotify.com/album/${albumId}` }
      },
      external_urls: { spotify: `https://open.spotify.com/track/${id}` }
    };
  });
}
function convertSearchAlbums(items) {
  return items.filter(
    (item) => item.__typename === "AlbumResponseWrapper" && item.data?.__typename === "Album"
  ).map((item) => {
    const album = item.data;
    const id = album.uri?.split(":").pop();
    const artists = album.artists?.items?.map((artist) => {
      const artistId = artist.uri?.split(":").pop();
      return {
        id: artistId,
        name: artist.profile?.name,
        uri: artist.uri,
        external_urls: { spotify: `https://open.spotify.com/artist/${artistId}` }
      };
    }) || [];
    return {
      id,
      name: album.name,
      album_type: album.type?.toLowerCase(),
      images: album.coverArt?.sources || [],
      artists,
      release_date: album.date?.year?.toString(),
      external_urls: { spotify: `https://open.spotify.com/album/${id}` }
    };
  });
}
function convertSearchArtists(items) {
  return items.filter(
    (item) => item.__typename === "ArtistResponseWrapper" && item.data?.__typename === "Artist"
  ).map((item) => {
    const artist = item.data;
    const id = artist.uri?.split(":").pop();
    return {
      id,
      name: artist.profile?.name,
      uri: artist.uri,
      images: artist.visuals?.avatarImage?.sources || [],
      external_urls: { spotify: `https://open.spotify.com/artist/${id}` }
    };
  });
}
function convertSearchPlaylists(items) {
  return items.filter(
    (item) => item.__typename === "PlaylistResponseWrapper" && item.data?.__typename === "Playlist"
  ).map((item) => {
    const playlist = item.data;
    const id = playlist.uri?.split(":").pop();
    const owner = playlist.ownerV2?.data;
    const ownerId = owner?.uri?.split(":").pop();
    return {
      id,
      name: playlist.name,
      description: playlist.description,
      uri: playlist.uri,
      images: playlist.images?.items?.flatMap((img) => img.sources) || [],
      external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
      owner: {
        id: ownerId,
        display_name: owner?.name,
        uri: owner?.uri
      }
    };
  });
}
const SpotifyGqlApi = {
  user: {
    me: getMe,
    savedTracks: getSavedTracks,
    savedPlaylists: getSavedPlaylists
  },
  playlist: {
    get: getPlaylist,
    getTracks: getPlaylistTracks
  },
  album: {
    get: getAlbum,
    getTracks: getAlbumTracks
  },
  artist: {
    get: getArtist,
    getTopTracks: getArtistTopTracks
  },
  track: {
    get: getTrack
  },
  search: {
    all: searchAll,
    tracks: searchTracks,
    albums: searchAlbums
  },
  library: {
    checkSavedTracks,
    saveTracks,
    removeTracks
  },
  browse: {
    home: getHome
  }
};
function initSpotifyHandlers() {
  console.log("[SpotifyHandler] Initializing...");
  electron.ipcMain.handle("spotify:get-me", async () => {
    try {
      return await SpotifyGqlApi.user.me();
    } catch (error) {
      console.error("[SpotifyHandler] get-me error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("spotify:get-saved-tracks", async (_, limit = 20, offset = 0) => {
    try {
      return await SpotifyGqlApi.user.savedTracks(offset, limit);
    } catch (error) {
      console.error("[SpotifyHandler] get-saved-tracks error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("spotify:get-my-playlists", async (_, limit = 50, offset = 0) => {
    try {
      return await SpotifyGqlApi.user.savedPlaylists(offset, limit);
    } catch (error) {
      console.error("[SpotifyHandler] get-my-playlists error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("spotify:get-playlist", async (_, playlistId) => {
    try {
      return await SpotifyGqlApi.playlist.get(playlistId);
    } catch (error) {
      console.error("[SpotifyHandler] get-playlist error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("spotify:get-playlist-tracks", async (_, playlistId, limit = 25, offset = 0) => {
    try {
      return await SpotifyGqlApi.playlist.getTracks(playlistId, offset, limit);
    } catch (error) {
      console.error("[SpotifyHandler] get-playlist-tracks error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("spotify:get-album", async (_, albumId) => {
    try {
      return await SpotifyGqlApi.album.get(albumId);
    } catch (error) {
      console.error("[SpotifyHandler] get-album error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("spotify:get-album-tracks", async (_, albumId, offset = 0, limit = 50) => {
    try {
      return await SpotifyGqlApi.album.getTracks(albumId, offset, limit);
    } catch (error) {
      console.error("[SpotifyHandler] get-album-tracks error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("spotify:get-artist", async (_, artistId) => {
    try {
      return await SpotifyGqlApi.artist.get(artistId);
    } catch (error) {
      console.error("[SpotifyHandler] get-artist error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("spotify:get-artist-top-tracks", async (_, artistId) => {
    try {
      return await SpotifyGqlApi.artist.getTopTracks(artistId);
    } catch (error) {
      console.error("[SpotifyHandler] get-artist-top-tracks error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("spotify:get-track", async (_, trackId) => {
    try {
      return await SpotifyGqlApi.track.get(trackId);
    } catch (error) {
      console.error("[SpotifyHandler] get-track error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("spotify:search", async (_, query, offset = 0, limit = 10) => {
    try {
      return await SpotifyGqlApi.search.all(query, offset, limit);
    } catch (error) {
      console.error("[SpotifyHandler] search error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("spotify:search-tracks", async (_, query, offset = 0, limit = 20) => {
    try {
      return await SpotifyGqlApi.search.tracks(query, offset, limit);
    } catch (error) {
      console.error("[SpotifyHandler] search-tracks error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("spotify:search-albums", async (_, query, offset = 0, limit = 20) => {
    try {
      return await SpotifyGqlApi.search.albums(query, offset, limit);
    } catch (error) {
      console.error("[SpotifyHandler] search-albums error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("spotify:check-saved-tracks", async (_, trackIds) => {
    try {
      return await SpotifyGqlApi.library.checkSavedTracks(trackIds);
    } catch (error) {
      console.error("[SpotifyHandler] check-saved-tracks error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("spotify:save-tracks", async (_, trackIds) => {
    try {
      return await SpotifyGqlApi.library.saveTracks(trackIds);
    } catch (error) {
      console.error("[SpotifyHandler] save-tracks error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("spotify:remove-tracks", async (_, trackIds) => {
    try {
      return await SpotifyGqlApi.library.removeTracks(trackIds);
    } catch (error) {
      console.error("[SpotifyHandler] remove-tracks error:", error.message);
    }
  });
  electron.ipcMain.handle("spotify:get-home", async (_, limit = 20) => {
    try {
      return await SpotifyGqlApi.browse.home("Asia/Kolkata", limit);
    } catch (error) {
      console.error("[SpotifyHandler] get-home error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("spotify:is-authenticated", async () => {
    return spotifyAuth.isAuthenticated();
  });
  electron.ipcMain.handle("spotify:get-access-token", async () => {
    return spotifyAuth.accessToken;
  });
  console.log("[SpotifyHandler] Initialized");
}
electron.app.commandLine.appendSwitch("ignore-certificate-errors");
const CACHE_DIR = path.join(electron.app.getPath("userData"), "audio-cache");
const CACHE_SETTINGS_FILE = path.join(electron.app.getPath("userData"), "cache-settings.json");
const DEFAULT_CACHE_SETTINGS = {
  enabled: true,
  maxSizeMB: 500
};
const ensureCacheDir = () => {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
};
const getCacheSettings = () => {
  try {
    if (fs.existsSync(CACHE_SETTINGS_FILE)) {
      const data = fs.readFileSync(CACHE_SETTINGS_FILE, "utf-8");
      return { ...DEFAULT_CACHE_SETTINGS, ...JSON.parse(data) };
    }
  } catch (e) {
    console.error("Error reading cache settings:", e);
  }
  return DEFAULT_CACHE_SETTINGS;
};
const saveCacheSettings = (settings) => {
  try {
    fs.writeFileSync(CACHE_SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error("Error saving cache settings:", e);
  }
};
const getCacheEntries = () => {
  ensureCacheDir();
  const entries = [];
  try {
    const files = fs.readdirSync(CACHE_DIR);
    const metaFiles = files.filter((f) => f.endsWith(".meta.json"));
    for (const metaFile of metaFiles) {
      const key = metaFile.replace(".meta.json", "");
      const audioPath = path.join(CACHE_DIR, `${key}.audio`);
      const metaPath = path.join(CACHE_DIR, metaFile);
      if (fs.existsSync(audioPath)) {
        try {
          const metadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          entries.push({ key, metadata, audioPath });
        } catch (e) {
        }
      }
    }
  } catch (e) {
    console.error("Error reading cache entries:", e);
  }
  return entries;
};
const getCacheSizeBytes = () => {
  const entries = getCacheEntries();
  return entries.reduce((total, entry) => total + (entry.metadata.size || 0), 0);
};
const evictIfNeeded = (maxSizeBytes, reserveBytes = 0) => {
  const currentSize = getCacheSizeBytes();
  const targetSize = maxSizeBytes - reserveBytes;
  if (currentSize <= targetSize) return;
  const entries = getCacheEntries();
  entries.sort((a, b) => a.metadata.cachedAt - b.metadata.cachedAt);
  let freedBytes = 0;
  const bytesToFree = currentSize - targetSize;
  for (const entry of entries) {
    if (freedBytes >= bytesToFree) break;
    try {
      fs.unlinkSync(entry.audioPath);
      fs.unlinkSync(path.join(CACHE_DIR, `${entry.key}.meta.json`));
      freedBytes += entry.metadata.size;
      console.log(`[Cache] Evicted: ${entry.key} (${entry.metadata.size} bytes)`);
    } catch (e) {
      console.error(`Error evicting ${entry.key}:`, e);
    }
  }
};
electron.ipcMain.handle("cache-get", async (_, key) => {
  try {
    const settings = getCacheSettings();
    if (!settings.enabled) return null;
    const audioPath = path.join(CACHE_DIR, `${key}.audio`);
    if (fs.existsSync(audioPath)) {
      const data = fs.readFileSync(audioPath);
      console.log(`[Cache] HIT: ${key}`);
      return data.buffer;
    }
    console.log(`[Cache] MISS: ${key}`);
    return null;
  } catch (e) {
    console.error("Cache get error:", e);
    return null;
  }
});
electron.ipcMain.handle("cache-put", async (_, key, data, metadata) => {
  try {
    const settings = getCacheSettings();
    if (!settings.enabled) return false;
    ensureCacheDir();
    const maxSizeBytes = settings.maxSizeMB * 1024 * 1024;
    const dataSize = data.byteLength;
    if (dataSize > maxSizeBytes) {
      console.log(`[Cache] File too large to cache: ${dataSize} bytes`);
      return false;
    }
    evictIfNeeded(maxSizeBytes, dataSize);
    const audioPath = path.join(CACHE_DIR, `${key}.audio`);
    const metaPath = path.join(CACHE_DIR, `${key}.meta.json`);
    const fullMetadata = {
      trackId: "",
      searchQuery: "",
      ...metadata,
      cachedAt: Date.now(),
      size: dataSize
    };
    fs.writeFileSync(audioPath, Buffer.from(data));
    fs.writeFileSync(metaPath, JSON.stringify(fullMetadata, null, 2));
    console.log(`[Cache] STORED: ${key} (${dataSize} bytes)`);
    return true;
  } catch (e) {
    console.error("Cache put error:", e);
    return false;
  }
});
electron.ipcMain.handle("cache-delete", async (_, key) => {
  try {
    const audioPath = path.join(CACHE_DIR, `${key}.audio`);
    const metaPath = path.join(CACHE_DIR, `${key}.meta.json`);
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    console.log(`[Cache] DELETED: ${key}`);
    return true;
  } catch (e) {
    console.error("Cache delete error:", e);
    return false;
  }
});
electron.ipcMain.handle("cache-clear", async () => {
  try {
    ensureCacheDir();
    const files = fs.readdirSync(CACHE_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(CACHE_DIR, file));
    }
    console.log("[Cache] CLEARED all entries");
    return true;
  } catch (e) {
    console.error("Cache clear error:", e);
    return false;
  }
});
electron.ipcMain.handle("cache-stats", async () => {
  try {
    const entries = getCacheEntries();
    const totalSize = entries.reduce((sum, e) => sum + e.metadata.size, 0);
    return {
      count: entries.length,
      sizeBytes: totalSize,
      sizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100
    };
  } catch (e) {
    console.error("Cache stats error:", e);
    return { count: 0, sizeBytes: 0, sizeMB: 0 };
  }
});
electron.ipcMain.handle("cache-settings-get", async () => {
  return getCacheSettings();
});
electron.ipcMain.handle("cache-settings-set", async (_, settings) => {
  try {
    const current = getCacheSettings();
    const updated = { ...current, ...settings };
    saveCacheSettings(updated);
    if (updated.enabled && settings.maxSizeMB) {
      evictIfNeeded(updated.maxSizeMB * 1024 * 1024);
    }
    return true;
  } catch (e) {
    console.error("Cache settings save error:", e);
    return false;
  }
});
electron.ipcMain.handle("cache-list", async () => {
  try {
    const entries = getCacheEntries();
    return entries.map((entry) => ({
      key: entry.key,
      trackId: entry.metadata.trackId,
      searchQuery: entry.metadata.searchQuery,
      cachedAt: entry.metadata.cachedAt,
      sizeMB: Math.round(entry.metadata.size / (1024 * 1024) * 100) / 100
    }));
  } catch (e) {
    console.error("Cache list error:", e);
    return [];
  }
});
const SONG_PREFS_FILE = path.join(electron.app.getPath("userData"), "song-preferences.json");
const loadSongPreferences = () => {
  try {
    if (fs.existsSync(SONG_PREFS_FILE)) {
      const data = fs.readFileSync(SONG_PREFS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error loading song preferences:", e);
  }
  return {};
};
const saveSongPreferences = (prefs) => {
  try {
    fs.writeFileSync(SONG_PREFS_FILE, JSON.stringify(prefs, null, 2));
  } catch (e) {
    console.error("Error saving song preferences:", e);
  }
};
electron.ipcMain.handle("song-pref-get", async (_, trackKey) => {
  try {
    const prefs = loadSongPreferences();
    return prefs[trackKey] || null;
  } catch (e) {
    console.error("Song pref get error:", e);
    return null;
  }
});
electron.ipcMain.handle(
  "song-pref-set",
  async (_, trackKey, preference) => {
    try {
      const prefs = loadSongPreferences();
      prefs[trackKey] = {
        ...preference,
        savedAt: Date.now()
      };
      saveSongPreferences(prefs);
      console.log(`[SongPref] Saved preference for: ${trackKey}`);
      return true;
    } catch (e) {
      console.error("Song pref set error:", e);
      return false;
    }
  }
);
electron.ipcMain.handle("song-pref-delete", async (_, trackKey) => {
  try {
    const prefs = loadSongPreferences();
    if (prefs[trackKey]) {
      delete prefs[trackKey];
      saveSongPreferences(prefs);
      console.log(`[SongPref] Deleted preference for: ${trackKey}`);
    }
    return true;
  } catch (e) {
    console.error("Song pref delete error:", e);
    return false;
  }
});
electron.ipcMain.handle("song-pref-list", async () => {
  try {
    return loadSongPreferences();
  } catch (e) {
    console.error("Song pref list error:", e);
    return {};
  }
});
electron.ipcMain.handle("song-pref-clear", async () => {
  try {
    saveSongPreferences({});
    console.log("[SongPref] Cleared all preferences");
    return true;
  } catch (e) {
    console.error("Song pref clear error:", e);
    return false;
  }
});
const SPOTIFY_STORAGE_FILE = path.join(electron.app.getPath("userData"), "spotify-session.json");
const saveSpotifySession = (session2) => {
  try {
    fs.writeFileSync(SPOTIFY_STORAGE_FILE, JSON.stringify(session2, null, 2));
    console.log("[Spotify] Session saved");
  } catch (e) {
    console.error("Error saving Spotify session:", e);
  }
};
const loadSpotifySession = () => {
  try {
    if (fs.existsSync(SPOTIFY_STORAGE_FILE)) {
      return JSON.parse(fs.readFileSync(SPOTIFY_STORAGE_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("Error loading Spotify session:", e);
  }
  return null;
};
process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = electron.app.isPackaged ? process.env.DIST : path.join(__dirname, "../public");
let win;
let tray = null;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const isDev = !electron.app.isPackaged;
const prodPath = path.join(process.resourcesPath, "bin", "yt-dlp.exe");
const devPath = path.join(__dirname, "../bin/yt-dlp.exe");
const ytDlpPath = isDev ? devPath : prodPath;
if (!isDev && !fs.existsSync(ytDlpPath)) {
  electron.dialog.showErrorBox("Critical Error", `yt-dlp.exe missing at:
${ytDlpPath}`);
}
const runYtDlp = (args) => {
  return new Promise((resolve, reject) => {
    child_process.execFile(ytDlpPath, args, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        console.error("yt-dlp error:", stderr);
        reject(error);
        return;
      }
      try {
        const json = JSON.parse(stdout);
        resolve(json);
      } catch (parseError) {
        console.error("JSON Parse Error:", parseError);
        reject(parseError);
      }
    });
  });
};
const pendingDownloads = /* @__PURE__ */ new Map();
function createWindow() {
  win = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC || "", "electron-vite.svg"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });
  win.setMenuBarVisibility(false);
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  win.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ["*://*.youtube.com/*", "*://*.googlevideo.com/*"] },
    (details, callback) => {
      const { requestHeaders } = details;
      Object.keys(requestHeaders).forEach((header) => {
        if (header.toLowerCase() === "referer" || header.toLowerCase() === "origin") {
          delete requestHeaders[header];
        }
      });
      requestHeaders["Referer"] = "https://www.youtube.com/";
      requestHeaders["Origin"] = "https://www.youtube.com";
      callback({ requestHeaders });
    }
  );
  win.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ["https://open.spotify.com/get_access_token*"] },
    (details, callback) => {
      callback({ requestHeaders: details.requestHeaders });
    }
  );
  win.webContents.session.on("will-download", (event, item, webContents) => {
    const url = item.getURL();
    const options = pendingDownloads.get(url) || { filename: "audio.mp3", saveAs: false };
    if (options.filename) {
      item.setSavePath(path.join(electron.app.getPath("downloads"), options.filename));
    }
    if (options.saveAs) {
      const result = electron.dialog.showSaveDialogSync(win, {
        defaultPath: options.filename,
        filters: [{ name: "Audio Files", extensions: ["mp3", "m4a"] }]
      });
      if (result) item.setSavePath(result);
      else {
        item.cancel();
        return;
      }
    }
    item.on("updated", (event2, state) => {
      if (state === "progressing" && !item.isPaused()) {
        win?.webContents.send("download-progress", {
          url,
          progress: item.getReceivedBytes() / item.getTotalBytes(),
          received: item.getReceivedBytes(),
          total: item.getTotalBytes()
        });
      }
    });
    item.on("done", (event2, state) => {
      pendingDownloads.delete(url);
      win?.webContents.send("download-complete", {
        url,
        state,
        path: item.getSavePath()
      });
    });
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(process.env.DIST || "", "index.html"));
  }
  if (!tray) {
    const iconDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADfSURBVDiNpZMxDoJAEEXfLhYmFjZewMbGxMQLeBN7C2+gd7Cx9AYcwNLL2GhjZ2dBQmICsptQCJBlJ5Ns8f/szOwfYKG1fkhBLoANsAMiYGcavsLME7AH4tQnhMBDAGugBlrmWQEBsAXutNYnM/8K7A1rlFJlEi+B+H8MEbABbrXWRynnBRb/JQihYg4wBrrm/hxomLlvYEFmDuwDG6BttN4FXGQZEAPXQNnMbcKQKaVKJdADQq31ycRChh4wABpG6x0hjYGhuT8DamYOZv6aWMjLwNDcHwNV8/cBeAe/iyFO7WBXRQAAAABJRU5ErkJggg==";
    const trayIcon = electron.nativeImage.createFromDataURL(iconDataUrl);
    tray = new electron.Tray(trayIcon);
    tray.setToolTip("Ragam Music Player");
    const contextMenu = electron.Menu.buildFromTemplate([
      {
        label: "Show App",
        click: () => {
          if (win) {
            win.show();
            win.focus();
          }
        }
      },
      {
        label: "Minimize to Tray",
        click: () => {
          win?.hide();
        }
      },
      { type: "separator" },
      {
        label: "Play/Pause",
        click: () => {
          win?.webContents.send("tray-playpause");
        }
      },
      {
        label: "Next Track",
        click: () => {
          win?.webContents.send("tray-next");
        }
      },
      {
        label: "Previous Track",
        click: () => {
          win?.webContents.send("tray-previous");
        }
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          electron.app.quit();
        }
      }
    ]);
    tray.setContextMenu(contextMenu);
    tray.on("double-click", () => {
      if (win) {
        win.show();
        win.focus();
      }
    });
  }
}
electron.ipcMain.handle("youtube-search-video", async (_, query) => {
  try {
    console.log(`[YouTube Video Search] Searching: ${query}`);
    const args = [
      `ytsearch5:${query}`,
      "--dump-single-json",
      "--flat-playlist",
      // Get metadata only (fast)
      "--no-warnings",
      "--no-check-certificate"
    ];
    const output = await runYtDlp(args);
    if (!output || !output.entries) {
      return [];
    }
    return output.entries.map((video) => ({
      id: video.id,
      title: video.title,
      thumbnail: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
      channel: video.uploader,
      duration: video.duration
    }));
  } catch (error) {
    console.error("[YouTube Video Search] Error:", error);
    return [];
  }
});
electron.ipcMain.handle("youtube-search", async (_, query, region = "US") => {
  try {
    console.log(`[YouTube Music] Searching: ${query} (Region: ${region})`);
    const searchUrl = `https://music.youtube.com/search?q=${encodeURIComponent(query)}`;
    const args = [
      searchUrl,
      "--dump-single-json",
      "--playlist-items",
      "1,2,3,4,5,6,7,8,9,10",
      "--flat-playlist",
      "--no-warnings",
      "--no-check-certificate",
      "--geo-bypass-country",
      region
      // Apply User Region
    ];
    const output = await runYtDlp(args);
    if (!output || !output.entries) return [];
    return output.entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      channelTitle: entry.uploader || entry.artist || "YouTube Music",
      duration: entry.duration,
      thumbnail: `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
      artists: [{ name: entry.uploader || entry.artist || "Unknown" }]
    }));
  } catch (error) {
    console.warn("YTM Search failed, falling back to standard ytsearch:", error.message);
    try {
      const fbArgs = [
        query,
        "--dump-single-json",
        "--default-search",
        "ytsearch5:",
        "--flat-playlist",
        "--no-warnings",
        "--no-check-certificate",
        "--geo-bypass-country",
        region
      ];
      const fbOutput = await runYtDlp(fbArgs);
      if (!fbOutput || !fbOutput.entries) return [];
      return fbOutput.entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        channelTitle: entry.uploader,
        duration: entry.duration,
        thumbnail: `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
        artists: [{ name: entry.uploader }]
      }));
    } catch (fbError) {
      console.error("Fallback Search Error:", fbError);
      return [];
    }
  }
});
electron.ipcMain.handle("youtube-stream", async (_, videoId, quality = "high") => {
  try {
    console.log(`[YouTube] Fetching Stream for: ${videoId} (Quality: ${quality})`);
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    let formatSelector = "bestaudio/best";
    if (quality === "medium") {
      formatSelector = "bestaudio[abr<=128]/bestaudio";
    } else if (quality === "low") {
      formatSelector = "worstaudio";
    }
    const args = [
      url,
      "--dump-single-json",
      "--no-warnings",
      "--format",
      formatSelector,
      "--no-check-certificate"
    ];
    const output = await runYtDlp(args);
    if (!output || !output.url) throw new Error("No stream URL found");
    return {
      url: output.url,
      duration: output.duration,
      title: output.title
    };
  } catch (error) {
    console.error("[YouTube] Stream Extraction Error:", error);
    return null;
  }
});
electron.ipcMain.handle("youtube-video-url", async (_, videoId) => {
  try {
    console.log(`[YouTube] Fetching HLS Stream for: ${videoId}`);
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const args = [url, "--dump-single-json", "--no-warnings", "--no-check-certificate"];
    const output = await runYtDlp(args);
    let streamUrl = output.manifest_url;
    if (!streamUrl && output.formats) {
      const hlsFormat = output.formats.find(
        (f) => f.protocol === "m3u8" || f.protocol === "m3u8_native"
      );
      if (hlsFormat) {
        streamUrl = hlsFormat.url;
      }
    }
    if (!streamUrl) {
      console.log("No HLS found, falling back to MP4");
      const mp4Format = output.formats.reverse().find((f) => f.ext === "mp4" && f.acodec !== "none" && f.vcodec !== "none");
      streamUrl = mp4Format ? mp4Format.url : output.url;
    }
    if (!streamUrl) throw new Error("No video stream found");
    return {
      url: streamUrl,
      title: output.title,
      isHls: streamUrl.includes(".m3u8")
    };
  } catch (error) {
    console.error("[YouTube] Video Stream Error:", error);
    return null;
  }
});
electron.ipcMain.handle("download-start", async (_, { url, filename, saveAs }) => {
  try {
    pendingDownloads.set(url, { filename, saveAs });
    win?.webContents.downloadURL(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
electron.ipcMain.handle("spotify-login", async () => {
  return new Promise((resolve, reject) => {
    const authWindow = new electron.BrowserWindow({
      width: 800,
      height: 600,
      show: true,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: "persist:spotify_login",
        webSecurity: false
      }
    });
    const authSession = authWindow.webContents.session;
    authSession.webRequest.onBeforeRequest(
      { urls: ["*://*.spotify.com/*/service-worker.js"] },
      (details, callback) => {
        callback({ cancel: true });
      }
    );
    authWindow.loadURL("https://accounts.spotify.com/en/login");
    let isResolved = false;
    let spDcCookie = null;
    const checkLoginSuccess = async () => {
      if (isResolved || authWindow.isDestroyed()) return;
      try {
        const currentUrl = authWindow.webContents.getURL();
        if (currentUrl.includes("accounts.spotify.com/en/status") || currentUrl.includes("open.spotify.com")) {
          if (currentUrl.includes("accounts.spotify.com")) {
            console.log("[Spotify Auth] Redirecting to open.spotify.com");
            authWindow.loadURL("https://open.spotify.com/");
            return;
          }
          const cookies = await authSession.cookies.get({
            name: "sp_dc",
            url: "https://open.spotify.com"
          });
          if (cookies.length === 0) {
            console.log("[Spotify Auth] No sp_dc cookie yet, retrying...");
            return;
          }
          spDcCookie = cookies[0].value;
          console.log("[Spotify Auth] Got sp_dc cookie, length:", spDcCookie.length);
          clearInterval(cookieCheckInterval);
          console.log("[Spotify Auth] Using TOTP authentication...");
          try {
            const result = await spotifyAuth.loginWithSpDc(spDcCookie);
            if (result.success && result.accessToken) {
              console.log("[Spotify Auth] TOTP login successful");
              const session2 = {
                accessToken: result.accessToken,
                accessTokenExpirationTimestampMs: result.expiration || Date.now() + 36e5,
                clientId: "",
                isAnonymous: false,
                spDcCookie,
                savedAt: Date.now()
              };
              saveSpotifySession(session2);
              isResolved = true;
              resolve(session2);
              setTimeout(() => {
                if (!authWindow.isDestroyed()) authWindow.close();
              }, 500);
            } else {
              throw new Error(result.error || "TOTP login failed");
            }
          } catch (authError) {
            console.error("[Spotify Auth] TOTP error:", authError);
            reject(new Error(`Token fetch failed: ${authError.message}`));
            authWindow.close();
          }
        }
      } catch (error) {
        console.error("[Spotify Auth] Check error:", error);
      }
    };
    const cookieCheckInterval = setInterval(checkLoginSuccess, 1e3);
    authWindow.on("closed", () => {
      clearInterval(cookieCheckInterval);
      if (!isResolved) {
        reject(new Error("Login cancelled by user"));
      }
    });
  });
});
electron.ipcMain.handle("spotify-refresh-token", async (_, storedSpDc) => {
  if (!storedSpDc) {
    const session2 = loadSpotifySession();
    if (!session2) return { success: false, error: "No stored session" };
    storedSpDc = session2.spDcCookie;
  }
  console.log("[Spotify Refresh] Using TOTP authentication...");
  try {
    const result = await spotifyAuth.loginWithSpDc(storedSpDc);
    if (result.success && result.accessToken) {
      const session2 = {
        accessToken: result.accessToken,
        accessTokenExpirationTimestampMs: result.expiration || Date.now() + 36e5,
        clientId: "",
        isAnonymous: false,
        spDcCookie: storedSpDc,
        savedAt: Date.now()
      };
      saveSpotifySession(session2);
      return {
        success: true,
        accessToken: result.accessToken,
        accessTokenExpirationTimestampMs: result.expiration
      };
    } else {
      return { success: false, error: result.error };
    }
  } catch (e) {
    console.error("[Spotify Refresh] TOTP error:", e);
    return { success: false, error: e.message };
  }
});
electron.ipcMain.handle("spotify-check-session", async () => {
  const session2 = loadSpotifySession();
  if (session2 && Date.now() < session2.accessTokenExpirationTimestampMs) {
    return { success: true, ...session2 };
  }
  return { success: false };
});
electron.ipcMain.handle("spotify-logout", async () => {
  if (fs.existsSync(SPOTIFY_STORAGE_FILE)) {
    fs.unlinkSync(SPOTIFY_STORAGE_FILE);
  }
  return { success: true };
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
    win = null;
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
electron.app.whenReady().then(() => {
  initPluginHandlers();
  initSpotifyHandlers();
  createWindow();
});
