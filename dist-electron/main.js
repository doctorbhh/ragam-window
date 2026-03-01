"use strict";
const electron = require("electron");
const path$1 = require("node:path");
const fs$1 = require("node:fs");
const http = require("node:http");
const child_process = require("child_process");
const events = require("events");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const https = require("node:https");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const crypto__namespace = /* @__PURE__ */ _interopNamespaceDefault(crypto);
let _sessionFile = null;
const getSessionFile = () => {
  if (!_sessionFile) {
    _sessionFile = path.join(electron.app.getPath("userData"), "spotify-session.json");
  }
  return _sessionFile;
};
const NUANCE_URL = "https://gist.githubusercontent.com/saraansx/a622d4c1a12c36afdcf701201e9482a3/raw/9afe2c9c7d1a5eb3f7a05d0002a94f45b73682d0/nuance.json";
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
      if (fs.existsSync(getSessionFile())) {
        const data = JSON.parse(fs.readFileSync(getSessionFile(), "utf-8"));
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
      fs.writeFileSync(getSessionFile(), JSON.stringify(session, null, 2));
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
          accessToken: this._accessToken ?? void 0,
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
      if (fs.existsSync(getSessionFile())) {
        fs.unlinkSync(getSessionFile());
      }
    } catch {
    }
    this.emit("logout");
  }
  async _fetchNuance() {
    try {
      const fetch2 = (await Promise.resolve().then(() => require("./index-CCtAWcID.js"))).default;
      const response = await fetch2(NUANCE_URL, {
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
      const fetch2 = (await Promise.resolve().then(() => require("./index-CCtAWcID.js"))).default;
      const response = await fetch2("https://open.spotify.com/api/server-time", {
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
  getAlbum: "b9bfabef66ed756e5e13f68a942deb60bd4125ec1f1be8cc42769dc0259b4b10",
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
    request.setHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    request.setHeader("Authorization", `Bearer ${accessToken}`);
    request.setHeader("Content-Type", "application/json");
    request.setHeader("Accept", "application/json");
    request.setHeader("Origin", "https://open.spotify.com");
    request.setHeader("Referer", "https://open.spotify.com/");
    request.setHeader("Sec-Fetch-Dest", "empty");
    request.setHeader("Sec-Fetch-Mode", "cors");
    request.setHeader("Sec-Fetch-Site", "same-site");
    request.setHeader("app-platform", "WebPlayer");
    request.setHeader("spotify-app-version", "1.2.30.290.g183057e9");
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
    request.setHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    request.setHeader("Authorization", `Bearer ${accessToken}`);
    request.setHeader("Accept", "application/json");
    request.setHeader("Origin", "https://open.spotify.com");
    request.setHeader("Referer", "https://open.spotify.com/");
    request.setHeader("Sec-Fetch-Dest", "empty");
    request.setHeader("Sec-Fetch-Mode", "cors");
    request.setHeader("Sec-Fetch-Site", "same-site");
    request.setHeader("app-platform", "WebPlayer");
    request.setHeader("spotify-app-version", "1.2.30.290.g183057e9");
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
async function searchArtists(query, offset = 0, limit = 20) {
  const result = await gqlRequest("searchDesktop", HASHES.searchDesktop, {
    searchTerm: query,
    offset,
    limit,
    numberOfTopResults: 20,
    includeAudiobooks: false,
    includeAuthors: false,
    includePreReleases: false
  });
  const searchData = result.data?.searchV2;
  if (!searchData) throw new Error("Artist search failed");
  return {
    artists: { items: convertSearchArtists(searchData.artists?.items || []) },
    total: searchData.artists?.totalCount || 0,
    offset,
    limit
  };
}
async function searchPlaylists(query, offset = 0, limit = 20) {
  const result = await gqlRequest("searchDesktop", HASHES.searchDesktop, {
    searchTerm: query,
    offset,
    limit,
    numberOfTopResults: 20,
    includeAudiobooks: false,
    includeAuthors: false,
    includePreReleases: false
  });
  const searchData = result.data?.searchV2;
  if (!searchData) throw new Error("Playlist search failed");
  return {
    playlists: { items: convertSearchPlaylists(searchData.playlists?.items || []) },
    total: searchData.playlists?.totalCount || 0,
    offset,
    limit
  };
}
async function getAlbum(albumId) {
  const result = await gqlRequest("getAlbum", HASHES.getAlbum, {
    uri: `spotify:album:${albumId}`,
    locale: "",
    offset: 0,
    limit: 50
  });
  const album = result.data?.albumUnion;
  if (!album) {
    console.error("[GQL] getAlbum returned null");
    throw new Error("Failed to get album");
  }
  const artists = album.artists?.items?.map((artist) => {
    const id = artist.uri?.split(":").pop();
    return {
      id,
      uri: artist.uri,
      name: artist.profile?.name,
      external_urls: { spotify: `https://open.spotify.com/artist/${id}` },
      images: artist.visuals?.avatarImage?.sources || []
    };
  }) || [];
  const tracksV2 = album.tracksV2?.items || [];
  const tracks = tracksV2.map((item) => {
    const track = item.track;
    const trackId = track.uri?.split(":").pop();
    const trackArtists = track.artists?.items?.map((artist) => {
      const id = artist.uri?.split(":").pop();
      return {
        id,
        uri: artist.uri,
        name: artist.profile?.name,
        external_urls: { spotify: `https://open.spotify.com/artist/${id}` }
      };
    }) || [];
    return {
      id: trackId,
      uri: track.uri,
      name: track.name,
      duration_ms: track.duration?.totalMilliseconds,
      explicit: track.contentRating?.label === "EXPLICIT",
      artists: trackArtists,
      album: {
        id: albumId,
        name: album.name,
        images: album.coverArt?.sources || [],
        external_urls: { spotify: `https://open.spotify.com/album/${albumId}` }
      },
      external_urls: { spotify: `https://open.spotify.com/track/${trackId}` },
      externalUri: `https://open.spotify.com/track/${trackId}`
      // Compat
    };
  });
  return {
    id: albumId,
    name: album.name,
    album_type: album.type?.toLowerCase(),
    label: album.label,
    release_date: album.date?.isoString,
    release_date_precision: album.date?.precision || "day",
    images: album.coverArt?.sources || [],
    artists,
    external_urls: { spotify: `https://open.spotify.com/album/${albumId}` },
    externalUri: `https://open.spotify.com/album/${albumId}`,
    // Compat
    copyrights: album.copyrights?.copyright || [],
    tracks: {
      items: tracks,
      total: album.tracksV2?.totalCount || 0
    }
  };
}
async function getAlbumTracks(albumId, offset = 0, limit = 50) {
  const result = await gqlRequest("getAlbum", HASHES.getAlbum, {
    uri: `spotify:album:${albumId}`,
    locale: "",
    offset,
    limit
  });
  const album = result.data?.albumUnion;
  if (!album) throw new Error("Failed to get album tracks");
  const tracksV2 = album.tracksV2?.items || [];
  const trackAlbum = {
    id: albumId,
    name: album.name,
    images: album.coverArt?.sources || [],
    external_urls: { spotify: `https://open.spotify.com/album/${albumId}` }
  };
  const tracks = tracksV2.map((item) => {
    const track = item.track;
    const trackId = track.uri?.split(":").pop();
    const trackArtists = track.artists?.items?.map((artist) => {
      const id = artist.uri?.split(":").pop();
      return {
        id,
        uri: artist.uri,
        name: artist.profile?.name,
        external_urls: { spotify: `https://open.spotify.com/artist/${id}` }
      };
    }) || [];
    return {
      id: trackId,
      uri: track.uri,
      name: track.name,
      duration_ms: track.duration?.totalMilliseconds,
      explicit: track.contentRating?.label === "EXPLICIT",
      artists: trackArtists,
      album: trackAlbum,
      external_urls: { spotify: `https://open.spotify.com/track/${trackId}` },
      externalUri: `https://open.spotify.com/track/${trackId}`
      // Compat
    };
  });
  return {
    items: tracks,
    total: album.tracksV2?.totalCount || 0,
    offset,
    limit,
    next: tracks.length < limit ? null : `offset=${offset + limit}`
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
async function getRelatedArtists(artistId) {
  const result = await gqlRequest("queryArtistOverview", HASHES.queryArtistOverview, {
    uri: `spotify:artist:${artistId}`,
    locale: ""
  });
  const artist = result.data?.artistUnion;
  if (!artist) throw new Error("Failed to get related artists");
  const related = artist.relatedContent?.relatedArtists?.items?.map((item) => {
    const id = item.uri?.split(":").pop();
    return {
      id,
      name: item.profile?.name,
      uri: item.uri,
      images: item.visuals?.avatarImage?.sources || [],
      external_urls: { spotify: `https://open.spotify.com/artist/${id}` }
    };
  }).filter(Boolean) || [];
  return { artists: related };
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
async function getRecommendations(seeds, limit = 10) {
  const params = new URLSearchParams();
  if (seeds.seed_tracks && seeds.seed_tracks.length > 0) {
    params.append("seed_tracks", seeds.seed_tracks.join(","));
  }
  if (seeds.seed_artists && seeds.seed_artists.length > 0) {
    params.append("seed_artists", seeds.seed_artists.join(","));
  }
  if (seeds.seed_genres && seeds.seed_genres.length > 0) {
    params.append("seed_genres", seeds.seed_genres.join(","));
  }
  params.append("limit", limit.toString());
  const result = await apiRequest(`/recommendations?${params.toString()}`);
  if (!result.tracks) {
    throw new Error("Failed to get recommendations");
  }
  return result.tracks.map((track) => ({
    id: track.id,
    name: track.name,
    uri: track.uri,
    duration_ms: track.duration_ms,
    artists: track.artists.map((artist) => ({
      id: artist.id,
      name: artist.name,
      uri: artist.uri,
      external_urls: artist.external_urls
    })),
    album: {
      id: track.album.id,
      name: track.album.name,
      images: track.album.images,
      external_urls: track.album.external_urls
    },
    external_urls: track.external_urls
  }));
}
async function getHome$1(timeZone = "Asia/Kolkata", limit = 20) {
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
    savedPlaylists: getSavedPlaylists,
    recentlyPlayed: getRecentlyPlayed
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
    getTopTracks: getArtistTopTracks,
    getRelatedArtists
  },
  track: {
    get: getTrack
  },
  search: {
    all: searchAll,
    tracks: searchTracks,
    albums: searchAlbums,
    artists: searchArtists,
    playlists: searchPlaylists
  },
  library: {
    checkSavedTracks,
    saveTracks,
    removeTracks
  },
  browse: {
    home: getHome$1,
    getRecommendations
  },
  player: {
    // Add player namespace if needed in future
  }
};
async function getRecentlyPlayed(limit = 50) {
  const result = await apiRequest(`/me/player/recently-played?limit=${limit}`);
  if (!result.items) {
    throw new Error("Failed to get recently played tracks");
  }
  return {
    items: result.items.map((item) => ({
      track: {
        id: item.track.id,
        name: item.track.name,
        uri: item.track.uri,
        duration_ms: item.track.duration_ms,
        artists: item.track.artists.map((artist) => ({
          id: artist.id,
          name: artist.name,
          uri: artist.uri,
          external_urls: artist.external_urls
        })),
        album: {
          id: item.track.album.id,
          name: item.track.album.name,
          images: item.track.album.images,
          external_urls: item.track.album.external_urls
        },
        external_urls: item.track.external_urls
      },
      played_at: item.played_at
    }))
  };
}
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
  electron.ipcMain.handle("spotify:get-recently-played", async (_, limit = 50) => {
    try {
      return await SpotifyGqlApi.user.recentlyPlayed(limit);
    } catch (error) {
      console.error("[SpotifyHandler] get-recently-played error:", error.message);
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
  electron.ipcMain.handle("spotify:get-related-artists", async (_, artistId) => {
    try {
      return await SpotifyGqlApi.artist.getRelatedArtists(artistId);
    } catch (error) {
      console.error("[SpotifyHandler] get-related-artists error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("spotify:get-recommendations", async (_, seeds, limit = 10) => {
    try {
      return await SpotifyGqlApi.browse.getRecommendations(seeds, limit);
    } catch (error) {
      console.error("[SpotifyHandler] get-recommendations error:", error.message);
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
  electron.ipcMain.handle("spotify:search-artists", async (_, query, offset = 0, limit = 20) => {
    try {
      return await SpotifyGqlApi.search.artists(query, offset, limit);
    } catch (error) {
      console.error("[SpotifyHandler] search-artists error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("spotify:search-playlists", async (_, query, offset = 0, limit = 20) => {
    try {
      return await SpotifyGqlApi.search.playlists(query, offset, limit);
    } catch (error) {
      console.error("[SpotifyHandler] search-playlists error:", error.message);
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
let ytmusicCookies = null;
let sapisid = null;
function getStoragePath() {
  return path__namespace.join(electron.app.getPath("userData"), "ytmusic-session.json");
}
function setCookies(cookies) {
  ytmusicCookies = cookies;
  const match = cookies.match(/SAPISID=([^;]+)/);
  sapisid = match ? match[1] : null;
  console.log("[YTMusicAuth] Cookies set, SAPISID found:", !!sapisid);
  try {
    fs__namespace.writeFileSync(getStoragePath(), JSON.stringify({ cookies }), "utf-8");
    console.log("[YTMusicAuth] Session saved to disk");
  } catch (err) {
    console.error("[YTMusicAuth] Failed to save session:", err);
  }
}
function getCookies() {
  return ytmusicCookies;
}
function getAuthHeader() {
  if (!sapisid) return null;
  const timestamp = Math.floor(Date.now() / 1e3);
  const origin = "https://music.youtube.com";
  const hash = crypto__namespace.createHash("sha1").update(`${timestamp} ${sapisid} ${origin}`).digest("hex");
  return `SAPISIDHASH ${timestamp}_${hash}`;
}
function clearCookies() {
  ytmusicCookies = null;
  sapisid = null;
  console.log("[YTMusicAuth] Session cleared");
  try {
    const storagePath = getStoragePath();
    if (fs__namespace.existsSync(storagePath)) {
      fs__namespace.unlinkSync(storagePath);
    }
  } catch (err) {
    console.error("[YTMusicAuth] Failed to remove session file:", err);
  }
}
function isAuthenticated() {
  return ytmusicCookies !== null && ytmusicCookies.length > 0;
}
function restoreSession() {
  try {
    const storagePath = getStoragePath();
    if (fs__namespace.existsSync(storagePath)) {
      const data = JSON.parse(fs__namespace.readFileSync(storagePath, "utf-8"));
      if (data?.cookies && data.cookies.length > 0) {
        setCookies(data.cookies);
        console.log("[YTMusicAuth] Session restored from disk");
        return true;
      }
    }
  } catch (err) {
    console.error("[YTMusicAuth] Failed to restore session:", err);
  }
  return false;
}
const MAX_CACHE_SIZE = 500;
const MAX_CONCURRENT = 3;
const DELAY_BETWEEN_MS = 200;
const cache = /* @__PURE__ */ new Map();
const cacheOrder = [];
let activeRequests = 0;
const queue = [];
function evictIfNeeded$1() {
  while (cache.size > MAX_CACHE_SIZE && cacheOrder.length > 0) {
    const oldest = cacheOrder.shift();
    cache.delete(oldest);
  }
}
function processQueue() {
  while (activeRequests < MAX_CONCURRENT && queue.length > 0) {
    const item = queue.shift();
    activeRequests++;
    doFetch(item);
  }
}
function doFetch(item) {
  const parsedUrl = new URL(item.url);
  const client = parsedUrl.protocol === "https:" ? https : http;
  const req = client.get(item.url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    },
    timeout: 1e4
  }, (response) => {
    const statusCode = response.statusCode || 0;
    if (statusCode === 429 || statusCode === 503) {
      response.resume();
      activeRequests--;
      if (item.retries > 0) {
        console.log(`[ThumbCache] ${statusCode} → retry in ${item.backoff}ms (${item.retries} left)`);
        setTimeout(() => {
          item.retries--;
          item.backoff = Math.min(item.backoff * 2, 3e4);
          queue.unshift(item);
          processQueue();
        }, item.backoff);
      } else {
        item.reject(new Error(`Rate limited after all retries`));
        scheduleNext();
      }
      return;
    }
    if (statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307) {
      response.resume();
      activeRequests--;
      const redirectUrl = response.headers.location;
      if (redirectUrl && item.retries > 0) {
        item.url = redirectUrl;
        item.retries--;
        queue.unshift(item);
        processQueue();
      } else {
        item.reject(new Error(`Too many redirects`));
        scheduleNext();
      }
      return;
    }
    if (statusCode !== 200) {
      response.resume();
      activeRequests--;
      item.reject(new Error(`HTTP ${statusCode}`));
      scheduleNext();
      return;
    }
    const chunks = [];
    response.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });
    response.on("end", () => {
      const buffer = Buffer.concat(chunks);
      cache.set(item.url, buffer);
      cacheOrder.push(item.url);
      evictIfNeeded$1();
      activeRequests--;
      item.resolve(buffer);
      scheduleNext();
    });
    response.on("error", (err) => {
      activeRequests--;
      item.reject(err);
      scheduleNext();
    });
  });
  req.on("timeout", () => {
    req.destroy();
    activeRequests--;
    if (item.retries > 0) {
      item.retries--;
      item.backoff = Math.min(item.backoff * 2, 3e4);
      queue.unshift(item);
      setTimeout(processQueue, item.backoff);
    } else {
      item.reject(new Error("Timeout"));
      scheduleNext();
    }
  });
  req.on("error", (err) => {
    activeRequests--;
    if (item.retries > 0) {
      setTimeout(() => {
        item.retries--;
        item.backoff = Math.min(item.backoff * 2, 3e4);
        queue.unshift(item);
        processQueue();
      }, item.backoff);
    } else {
      item.reject(err);
      scheduleNext();
    }
  });
}
function scheduleNext() {
  if (queue.length > 0) {
    setTimeout(processQueue, DELAY_BETWEEN_MS);
  }
}
function fetchWithQueue(url) {
  return new Promise((resolve, reject) => {
    queue.push({ url, resolve, reject, retries: 3, backoff: 2e3 });
    processQueue();
  });
}
function registerThumbProtocol() {
  electron.protocol.handle("thumb-cache", async (request) => {
    try {
      const originalUrl = decodeURIComponent(request.url.replace("thumb-cache://", ""));
      if (cache.has(originalUrl)) {
        return new Response(cache.get(originalUrl), {
          headers: { "Content-Type": "image/webp", "Cache-Control": "max-age=604800" }
        });
      }
      const buffer = await fetchWithQueue(originalUrl);
      return new Response(buffer, {
        headers: { "Content-Type": "image/webp", "Cache-Control": "max-age=604800" }
      });
    } catch (err) {
      console.error("[ThumbCache] Failed:", err.message?.substring(0, 80));
      return new Response("", { status: 502 });
    }
  });
  console.log("[ThumbCache] Protocol registered (cookie-free Node.js fetching)");
}
function toThumbUrl(url) {
  if (!url) return "";
  if (url.includes("googleusercontent.com") || url.includes("ggpht.com")) {
    return `thumb-cache://${encodeURIComponent(url)}`;
  }
  return url;
}
const INNERTUBE_BASE = "https://music.youtube.com/youtubei/v1";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CLIENT_VERSION = "1.20241118.01.00";
function getContext() {
  return {
    client: {
      clientName: "WEB_REMIX",
      clientVersion: CLIENT_VERSION,
      hl: "en",
      gl: "IN",
      experimentIds: [],
      experimentsToken: "",
      browserName: "Chrome",
      browserVersion: "120.0.0.0",
      osName: "Windows",
      osVersion: "10.0",
      platform: "DESKTOP",
      musicAppInfo: {
        pwaInstallabilityStatus: "PWA_INSTALLABILITY_STATUS_UNKNOWN",
        webDisplayMode: "WEB_DISPLAY_MODE_BROWSER",
        musicActivityMasterSwitch: "MUSIC_ACTIVITY_MASTER_SWITCH_INDETERMINATE",
        musicLocationMasterSwitch: "MUSIC_LOCATION_MASTER_SWITCH_INDETERMINATE"
      }
    },
    user: { lockedSafetyMode: false }
  };
}
async function innertubeRequest(endpoint, body, additionalParams = "") {
  const cookies = getCookies();
  if (!cookies) throw new Error("Not authenticated with YouTube Music");
  const url = `${INNERTUBE_BASE}/${endpoint}?prettyPrint=false${additionalParams}`;
  const requestBody = JSON.stringify({
    context: getContext(),
    ...body
  });
  return new Promise((resolve, reject) => {
    const request = electron.net.request({ url, method: "POST" });
    request.setHeader("Cookie", cookies);
    request.setHeader("User-Agent", USER_AGENT);
    request.setHeader("Content-Type", "application/json");
    request.setHeader("Origin", "https://music.youtube.com");
    request.setHeader("Referer", "https://music.youtube.com/");
    request.setHeader("X-Youtube-Client-Name", "67");
    request.setHeader("X-Youtube-Client-Version", CLIENT_VERSION);
    const authHeader = getAuthHeader();
    if (authHeader) {
      request.setHeader("Authorization", authHeader);
    }
    let data = "";
    request.on("response", (response) => {
      response.on("data", (chunk) => {
        data += chunk.toString();
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          console.error("[YTMusicApi] JSON parse error:", e, "Raw:", data.substring(0, 300));
          reject(new Error("Failed to parse YouTube Music response"));
        }
      });
    });
    request.on("error", (err) => {
      console.error("[YTMusicApi] Request error:", err);
      reject(err);
    });
    request.write(requestBody);
    request.end();
  });
}
function nav(obj, path2, nullIfAbsent = false) {
  let current = obj;
  for (const key of path2) {
    if (current == null || typeof current !== "object") {
      return nullIfAbsent ? null : void 0;
    }
    current = current[key];
  }
  return current ?? (nullIfAbsent ? null : void 0);
}
function proxyThumbnail(url, size = 226) {
  if (!url) return "";
  let resized = url;
  if (url.includes("googleusercontent.com") || url.includes("ggpht.com")) {
    resized = url.replace(/=w\d+[^&\s]*|=s\d+[^&\s]*/i, `=w${size}-h${size}-l90-rj`);
  }
  return toThumbUrl(resized);
}
function getThumbnails(renderer) {
  return nav(renderer, ["thumbnailRenderer", "musicThumbnailRenderer", "thumbnail", "thumbnails"]) || nav(renderer, ["thumbnail", "musicThumbnailRenderer", "thumbnail", "thumbnails"]) || [];
}
function getBestThumbnail(renderer) {
  const thumbs = getThumbnails(renderer);
  const url = thumbs.length > 0 ? thumbs[thumbs.length - 1]?.url || "" : "";
  return proxyThumbnail(url);
}
function parseSubtitleRuns(renderer) {
  const runs = nav(renderer, ["subtitle", "runs"]) || [];
  const artists = [];
  let album = null;
  let year = "";
  const fullSubtitle = runs.map((r) => r.text).join("");
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const browseId = nav(run, ["navigationEndpoint", "browseEndpoint", "browseId"], true);
    if (browseId) {
      if (browseId.startsWith("MPRE")) {
        album = { name: run.text, id: browseId };
      } else if (browseId.startsWith("UC") || browseId.startsWith("FE")) {
        artists.push({ name: run.text, id: browseId });
      }
    }
    if (run.text && /^\d{4}$/.test(run.text.trim())) {
      year = run.text.trim();
    }
  }
  return { artists, album, subtitle: fullSubtitle, year };
}
function parseSong(renderer) {
  const title = nav(renderer, ["title", "runs", "0", "text"]) || "";
  const videoId = nav(renderer, ["navigationEndpoint", "watchEndpoint", "videoId"]) || "";
  const playlistId = nav(renderer, ["navigationEndpoint", "watchEndpoint", "playlistId"], true) || "";
  const thumbnails = getThumbnails(renderer);
  const imageUrl = getBestThumbnail(renderer);
  const parsed = parseSubtitleRuns(renderer);
  return {
    type: "song",
    title,
    videoId,
    playlistId,
    artists: parsed.artists,
    album: parsed.album,
    subtitle: parsed.subtitle,
    thumbnails,
    imageUrl
  };
}
function parseWatchPlaylist(renderer) {
  const title = nav(renderer, ["title", "runs", "0", "text"]) || "";
  const playlistId = nav(renderer, ["navigationEndpoint", "watchPlaylistEndpoint", "playlistId"]) || "";
  const thumbnails = getThumbnails(renderer);
  const imageUrl = getBestThumbnail(renderer);
  const parsed = parseSubtitleRuns(renderer);
  return {
    type: "watch_playlist",
    title,
    playlistId,
    subtitle: parsed.subtitle,
    thumbnails,
    imageUrl
  };
}
function parsePlaylist(renderer) {
  const title = nav(renderer, ["title", "runs", "0", "text"]) || "";
  const browseId = nav(renderer, ["title", "runs", "0", "navigationEndpoint", "browseEndpoint", "browseId"]) || "";
  const playlistId = browseId.startsWith("VL") ? browseId.substring(2) : browseId;
  const thumbnails = getThumbnails(renderer);
  const imageUrl = getBestThumbnail(renderer);
  const parsed = parseSubtitleRuns(renderer);
  const runs = nav(renderer, ["subtitle", "runs"]) || [];
  let count = "";
  let author = [];
  if (runs.length >= 3) {
    const countText = runs[runs.length - 1]?.text || "";
    const match = countText.match(/(\d+)/);
    if (match) count = match[1];
    const firstRun = runs[0];
    if (firstRun?.navigationEndpoint) {
      author = [{ name: firstRun.text, id: nav(firstRun, ["navigationEndpoint", "browseEndpoint", "browseId"]) || "" }];
    }
  }
  return {
    type: "playlist",
    title,
    playlistId,
    browseId,
    subtitle: parsed.subtitle,
    description: parsed.subtitle,
    count,
    author,
    thumbnails,
    imageUrl
  };
}
function parseAlbum(renderer) {
  const title = nav(renderer, ["title", "runs", "0", "text"]) || "";
  const browseId = nav(renderer, ["title", "runs", "0", "navigationEndpoint", "browseEndpoint", "browseId"]) || "";
  const thumbnails = getThumbnails(renderer);
  const imageUrl = getBestThumbnail(renderer);
  const parsed = parseSubtitleRuns(renderer);
  return {
    type: "album",
    title,
    browseId,
    playlistId: browseId,
    artists: parsed.artists,
    year: parsed.year,
    subtitle: parsed.subtitle,
    thumbnails,
    imageUrl
  };
}
function parseArtist(renderer) {
  const title = nav(renderer, ["title", "runs", "0", "text"]) || "";
  const browseId = nav(renderer, ["title", "runs", "0", "navigationEndpoint", "browseEndpoint", "browseId"]) || "";
  const thumbnails = getThumbnails(renderer);
  const imageUrl = getBestThumbnail(renderer);
  const subscribers = nav(renderer, ["subtitle", "runs", "0", "text"], true) || "";
  return {
    type: "artist",
    title,
    browseId,
    subscribers: subscribers.split(" ")[0],
    subtitle: subscribers,
    thumbnails,
    imageUrl
  };
}
function extractItemFromRenderer(renderer) {
  const titleRun = nav(renderer, ["title", "runs", "0"]);
  if (!titleRun) return null;
  const navEndpoint = renderer?.navigationEndpoint || titleRun?.navigationEndpoint;
  const pageType = nav(navEndpoint, [
    "browseEndpoint",
    "browseEndpointContextSupportedConfigs",
    "browseEndpointContextMusicConfig",
    "pageType"
  ], true) || "";
  const watchVideoId = nav(navEndpoint, ["watchEndpoint", "videoId"], true);
  const watchPlaylistId = nav(navEndpoint, ["watchPlaylistEndpoint", "playlistId"], true);
  if (watchVideoId) {
    return parseSong(renderer);
  }
  if (watchPlaylistId && !pageType) {
    return parseWatchPlaylist(renderer);
  }
  if (pageType === "MUSIC_PAGE_TYPE_PLAYLIST") {
    return parsePlaylist(renderer);
  }
  if (pageType === "MUSIC_PAGE_TYPE_ALBUM" || pageType === "MUSIC_PAGE_TYPE_AUDIOBOOK") {
    return parseAlbum(renderer);
  }
  if (pageType === "MUSIC_PAGE_TYPE_ARTIST" || pageType === "MUSIC_PAGE_TYPE_USER_CHANNEL") {
    return parseArtist(renderer);
  }
  const browseId = nav(navEndpoint, ["browseEndpoint", "browseId"], true) || "";
  if (browseId.startsWith("VL")) {
    return parsePlaylist(renderer);
  }
  if (browseId.startsWith("UC") || browseId.startsWith("MP")) {
    return parseArtist(renderer);
  }
  if (browseId.startsWith("MPRE")) {
    return parseAlbum(renderer);
  }
  const title = titleRun?.text || "";
  const imageUrl = getBestThumbnail(renderer);
  const parsed = parseSubtitleRuns(renderer);
  return {
    type: "unknown",
    title,
    browseId,
    playlistId: browseId.startsWith("VL") ? browseId.substring(2) : "",
    subtitle: parsed.subtitle,
    thumbnails: getThumbnails(renderer),
    imageUrl,
    id: browseId || Math.random().toString(36)
  };
}
function extractShelfRenderers(data) {
  const sections = [];
  try {
    const tabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs || [];
    for (const tab of tabs) {
      const sectionList = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      for (const section of sectionList) {
        const shelf = section?.musicCarouselShelfRenderer || section?.musicImmersiveCarouselShelfRenderer;
        if (shelf) {
          const header = shelf.header?.musicCarouselShelfBasicHeaderRenderer || shelf.header?.musicImmersiveCarouselShelfBasicHeaderRenderer;
          const title = header?.title?.runs?.[0]?.text || "Untitled";
          const items = (shelf.contents || []).map((item) => {
            const twoRow = item?.musicTwoRowItemRenderer;
            if (twoRow) {
              return extractItemFromRenderer(twoRow);
            }
            const listItem = item?.musicResponsiveListItemRenderer;
            if (listItem) {
              return parseFlatSong(listItem);
            }
            return null;
          }).filter(Boolean);
          if (items.length > 0) {
            sections.push({
              id: title.replace(/\s+/g, "_").toLowerCase(),
              title,
              contents: items,
              items
            });
          }
        }
      }
    }
  } catch (e) {
    console.error("[YTMusicApi] Error extracting shelves:", e);
  }
  return sections;
}
function parseFlatSong(renderer) {
  const flexColumns = renderer.flexColumns || [];
  const title = nav(flexColumns, ["0", "musicResponsiveListItemFlexColumnRenderer", "text", "runs", "0", "text"]) || "";
  const videoId = nav(flexColumns, [
    "0",
    "musicResponsiveListItemFlexColumnRenderer",
    "text",
    "runs",
    "0",
    "navigationEndpoint",
    "watchEndpoint",
    "videoId"
  ], true) || renderer?.playlistItemData?.videoId || nav(renderer, [
    "overlay",
    "musicItemThumbnailOverlayRenderer",
    "content",
    "musicPlayButtonRenderer",
    "playNavigationEndpoint",
    "watchEndpoint",
    "videoId"
  ], true) || "";
  const artistRuns = nav(flexColumns, ["1", "musicResponsiveListItemFlexColumnRenderer", "text", "runs"]) || [];
  const artists = artistRuns.filter((r) => r.navigationEndpoint).map((r) => ({
    name: r.text,
    id: nav(r, ["navigationEndpoint", "browseEndpoint", "browseId"]) || ""
  }));
  const subtitle = artistRuns.map((r) => r.text).join("");
  const albumRun = nav(flexColumns, ["2", "musicResponsiveListItemFlexColumnRenderer", "text", "runs", "0"]);
  const album = albumRun ? {
    name: albumRun.text || "",
    id: nav(albumRun, ["navigationEndpoint", "browseEndpoint", "browseId"]) || ""
  } : null;
  const thumbnails = nav(renderer, ["thumbnail", "musicThumbnailRenderer", "thumbnail", "thumbnails"]) || [];
  const imageUrl = proxyThumbnail(thumbnails.length > 0 ? thumbnails[thumbnails.length - 1]?.url : "");
  const durationText = nav(renderer, ["fixedColumns", "0", "musicResponsiveListItemFixedColumnRenderer", "text", "runs", "0", "text"]) || "";
  const durationParts = durationText.split(":").map(Number);
  let durationMs = 0;
  let durationSeconds = 0;
  if (durationParts.length === 2) {
    durationSeconds = durationParts[0] * 60 + durationParts[1];
    durationMs = durationSeconds * 1e3;
  } else if (durationParts.length === 3) {
    durationSeconds = durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2];
    durationMs = durationSeconds * 1e3;
  }
  return {
    type: "song",
    title,
    videoId,
    artists,
    album,
    subtitle,
    thumbnails,
    imageUrl,
    duration: durationText,
    durationMs,
    durationSeconds,
    id: videoId || Math.random().toString(36)
  };
}
function extractPlaylistTracks(data) {
  const tracks = [];
  try {
    const twoCol = data?.contents?.twoColumnBrowseResultsRenderer;
    const secondarySection = twoCol?.secondaryContents?.sectionListRenderer;
    const primaryShelf = secondarySection?.contents?.[0]?.musicPlaylistShelfRenderer || secondarySection?.contents?.[0]?.musicShelfRenderer;
    if (primaryShelf?.contents) {
      for (const item of primaryShelf.contents) {
        const renderer = item?.musicResponsiveListItemRenderer;
        if (!renderer) continue;
        const track = parsePlaylistItem(renderer);
        if (track && track.videoId && track.title) {
          tracks.push(track);
        }
      }
    }
    if (tracks.length === 0) {
      const tabs = twoCol?.tabs || data?.contents?.singleColumnBrowseResultsRenderer?.tabs || [];
      for (const tab of tabs) {
        const sectionList = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
        for (const section of sectionList) {
          const shelf = section?.musicShelfRenderer || section?.musicPlaylistShelfRenderer;
          if (!shelf) continue;
          for (const item of shelf.contents || []) {
            const renderer = item?.musicResponsiveListItemRenderer;
            if (!renderer) continue;
            const track = parsePlaylistItem(renderer);
            if (track && track.videoId && track.title) {
              tracks.push(track);
            }
          }
        }
      }
    }
    if (tracks.length === 0 && twoCol) {
      const tabContents = twoCol.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      for (const sec of tabContents) {
        const shelf = sec?.musicShelfRenderer;
        if (shelf?.contents) {
          for (const item of shelf.contents) {
            const renderer = item?.musicResponsiveListItemRenderer;
            if (!renderer) continue;
            const track = parsePlaylistItem(renderer);
            if (track && track.videoId && track.title) {
              tracks.push(track);
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("[YTMusicApi] Error extracting playlist tracks:", e);
  }
  return tracks;
}
function parsePlaylistItem(renderer) {
  const flexColumns = renderer.flexColumns || [];
  let videoId = renderer?.playlistItemData?.videoId || "";
  if (!videoId) {
    videoId = nav(renderer, [
      "overlay",
      "musicItemThumbnailOverlayRenderer",
      "content",
      "musicPlayButtonRenderer",
      "playNavigationEndpoint",
      "watchEndpoint",
      "videoId"
    ], true) || "";
  }
  if (!videoId) {
    videoId = nav(flexColumns, [
      "0",
      "musicResponsiveListItemFlexColumnRenderer",
      "text",
      "runs",
      "0",
      "navigationEndpoint",
      "watchEndpoint",
      "videoId"
    ], true) || "";
  }
  if (!videoId) {
    const menuItems = nav(renderer, ["menu", "menuRenderer", "items"]) || [];
    for (const mi of menuItems) {
      const svc = mi?.menuServiceItemRenderer?.serviceEndpoint;
      if (svc?.playlistEditEndpoint) {
        videoId = svc.playlistEditEndpoint.actions?.[0]?.removedVideoId || "";
        if (videoId) break;
      }
    }
  }
  const title = nav(flexColumns, ["0", "musicResponsiveListItemFlexColumnRenderer", "text", "runs", "0", "text"]) || "";
  const artists = [];
  let album = null;
  let subtitleParts = [];
  for (let colIdx = 1; colIdx < flexColumns.length; colIdx++) {
    const runs = nav(flexColumns, [String(colIdx), "musicResponsiveListItemFlexColumnRenderer", "text", "runs"]) || [];
    for (const run of runs) {
      const browseEndpoint = nav(run, ["navigationEndpoint", "browseEndpoint"], true);
      if (browseEndpoint) {
        const pageType = nav(browseEndpoint, [
          "browseEndpointContextSupportedConfigs",
          "browseEndpointContextMusicConfig",
          "pageType"
        ], true) || "";
        if (pageType === "MUSIC_PAGE_TYPE_ARTIST" || pageType === "MUSIC_PAGE_TYPE_USER_CHANNEL" || pageType === "MUSIC_PAGE_TYPE_UNKNOWN") {
          artists.push({ name: run.text, id: browseEndpoint.browseId || "" });
        } else if (pageType === "MUSIC_PAGE_TYPE_ALBUM" || pageType === "MUSIC_PAGE_TYPE_AUDIOBOOK") {
          album = { name: run.text, id: browseEndpoint.browseId || "" };
        }
      }
      if (run.text) subtitleParts.push(run.text);
    }
  }
  const subtitle = subtitleParts.join("");
  if (artists.length === 0 && subtitle) {
    artists.push({ name: subtitle.split(" • ")[0]?.split(" & ")[0] || subtitle, id: "" });
  }
  const durationText = nav(renderer, ["fixedColumns", "0", "musicResponsiveListItemFixedColumnRenderer", "text", "runs", "0", "text"]) || "";
  const durationParts = durationText.split(":").map(Number);
  let durationSeconds = 0;
  if (durationParts.length === 2) durationSeconds = durationParts[0] * 60 + durationParts[1];
  else if (durationParts.length === 3) durationSeconds = durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2];
  const thumbnails = nav(renderer, ["thumbnail", "musicThumbnailRenderer", "thumbnail", "thumbnails"]) || [];
  const imageUrl = proxyThumbnail(thumbnails.length > 0 ? thumbnails[thumbnails.length - 1]?.url : "");
  return {
    type: "song",
    title,
    videoId,
    artists,
    album,
    subtitle,
    thumbnails,
    imageUrl,
    duration: durationText,
    durationMs: durationSeconds * 1e3,
    durationSeconds,
    id: videoId || Math.random().toString(36)
  };
}
function getSearchParams(filter, scope, ignoreSpelling = false) {
  const filteredParam1 = "EgWKAQ";
  let params = null;
  if (!filter && !scope && !ignoreSpelling) {
    return null;
  }
  if (scope === "uploads") {
    params = "agIYAw%3D%3D";
  }
  if (scope === "library") {
    if (filter) {
      const param2 = _getParam2(filter);
      return filteredParam1 + param2 + "AWoKEAUQCRADEAoYBA%3D%3D";
    } else {
      params = "agIYBA%3D%3D";
    }
  }
  if (!scope && filter) {
    if (filter === "playlists") {
      params = "Eg-KAQwIABAAGAAgACgB";
      if (!ignoreSpelling) {
        params += "MABqChAEEAMQCRAFEAo%3D";
      } else {
        params += "MABCAggBagoQBBADEAkQBRAK";
      }
    } else if (filter.includes("playlists")) {
      const param1 = "EgeKAQQoA";
      const param2 = filter === "featured_playlists" ? "Dg" : "EA";
      const param3 = !ignoreSpelling ? "BagwQDhAKEAMQBBAJEAU%3D" : "BQgIIAWoMEA4QChADEAQQCRAF";
      return param1 + param2 + param3;
    } else {
      const param2 = _getParam2(filter);
      const param3 = !ignoreSpelling ? "AWoMEA4QChADEAQQCRAF" : "AUICCAFqDBAOEAoQAxAEEAkQBQ%3D%3D";
      return filteredParam1 + param2 + param3;
    }
  }
  if (!scope && !filter && ignoreSpelling) {
    params = "EhGKAQ4IARABGAEgASgAOAFAAUICCAE%3D";
  }
  return params;
}
function _getParam2(filter) {
  const filterParams = {
    "songs": "II",
    "videos": "IQ",
    "albums": "IY",
    "artists": "Ig",
    "playlists": "Io",
    "profiles": "JY",
    "podcasts": "JQ",
    "episodes": "JI"
  };
  return filterParams[filter] || "";
}
function getFlexColumnItem(data, index) {
  if (data?.flexColumns?.length > index) {
    return nav(data.flexColumns[index], ["musicResponsiveListItemFlexColumnRenderer"], true);
  }
  return null;
}
function getItemText(data, index, runIndex = 0) {
  const item = getFlexColumnItem(data, index);
  if (!item) return null;
  return nav(item, ["text", "runs", runIndex, "text"], true);
}
function parseSearchResult(data, resultType, category) {
  const searchResult = { category };
  if (!resultType) {
    const browseId = nav(data, ["navigationEndpoint", "browseEndpoint", "browseId"], true);
    if (browseId) {
      if (browseId.startsWith("VM") || browseId.startsWith("RD") || browseId.startsWith("VL")) resultType = "playlist";
      else if (browseId.startsWith("MPLA")) resultType = "artist";
      else if (browseId.startsWith("MPRE")) resultType = "album";
      else if (browseId.startsWith("MPSP")) resultType = "podcast";
      else if (browseId.startsWith("MPED")) resultType = "episode";
      else if (browseId.startsWith("UC")) resultType = "artist";
    } else {
      const videoType = nav(data, ["playNavigationEndpoint", "watchEndpoint", "watchEndpointMusicSupportedConfigs", "watchEndpointMusicConfig", "musicVideoType"], true);
      if (videoType === "MUSIC_VIDEO_TYPE_ATV") resultType = "song";
      else if (videoType === "MUSIC_VIDEO_TYPE_PODCAST_EPISODE") resultType = "episode";
      else resultType = "video";
    }
  }
  if (!resultType && category) {
    const lowerCat = category.toLowerCase();
    if (lowerCat.includes("song")) resultType = "song";
    else if (lowerCat.includes("video")) resultType = "video";
    else if (lowerCat.includes("album")) resultType = "album";
    else if (lowerCat.includes("artist")) resultType = "artist";
    else if (lowerCat.includes("playlist")) resultType = "playlist";
  }
  if (!resultType) resultType = "song";
  searchResult.resultType = resultType;
  if (resultType !== "artist") {
    searchResult.title = nav(data, ["title", "runs", 0, "text"], true);
    if (!searchResult.title) {
      searchResult.title = getItemText(data, 0);
    }
  }
  if (resultType === "artist") {
    searchResult.artist = nav(data, ["title", "runs", 0, "text"], true) || getItemText(data, 0);
    searchResult.browseId = nav(data, ["navigationEndpoint", "browseEndpoint", "browseId"], true);
    searchResult.thumbnails = nav(data, ["thumbnail", "musicThumbnailRenderer", "thumbnail", "thumbnails"], true);
    const subtitle = nav(data, ["subtitle", "runs", 0, "text"], true);
    if (subtitle && subtitle.includes("subscribers")) {
      searchResult.subscribers = subtitle.split(" ")[0];
    }
  } else if (resultType === "album") {
    searchResult.type = nav(data, ["subtitle", "runs", 0, "text"], true);
    searchResult.browseId = nav(data, ["navigationEndpoint", "browseEndpoint", "browseId"], true);
    searchResult.thumbnails = nav(data, ["thumbnail", "musicThumbnailRenderer", "thumbnail", "thumbnails"], true);
    let runs = nav(data, ["subtitle", "runs"]);
    if (!runs) {
      const flexItem = getFlexColumnItem(data, 1);
      runs = nav(flexItem, ["text", "runs"], true) || [];
    }
    if (runs.length > 2) {
      searchResult.year = runs[runs.length - 1].text;
      searchResult.artist = runs[2].text;
    }
    if (!searchResult.type && runs.length > 0) searchResult.type = runs[0].text;
  } else if (resultType === "playlist") {
    searchResult.title = nav(data, ["title", "runs", 0, "text"], true) || getItemText(data, 0);
    searchResult.thumbnails = nav(data, ["thumbnail", "musicThumbnailRenderer", "thumbnail", "thumbnails"], true);
    let runs = nav(data, ["subtitle", "runs"]);
    if (!runs) {
      const flexItem = getFlexColumnItem(data, 1);
      runs = nav(flexItem, ["text", "runs"], true) || [];
    }
    if (runs.length > 0) {
      searchResult.author = runs[0].text;
      searchResult.itemCount = runs[runs.length - 1]?.text.split(" ")[0];
    }
    const browseId = nav(data, ["navigationEndpoint", "browseEndpoint", "browseId"], true);
    searchResult.playlistId = browseId;
    searchResult.browseId = browseId;
  } else if (resultType === "song") {
    searchResult.type = "song";
    searchResult.videoId = nav(data, ["playNavigationEndpoint", "watchEndpoint", "videoId"], true);
    if (!searchResult.videoId) {
      searchResult.videoId = nav(data, ["onTap", "watchEndpoint", "videoId"], true);
    }
    searchResult.title = nav(data, ["title", "runs", 0, "text"], true) || getItemText(data, 0);
    searchResult.thumbnails = nav(data, ["thumbnail", "musicThumbnailRenderer", "thumbnail", "thumbnails"], true);
    let runs = nav(data, ["subtitle", "runs"]);
    if (!runs) {
      const flexItem = getFlexColumnItem(data, 1);
      runs = nav(flexItem, ["text", "runs"], true) || [];
    }
    const artists = [];
    let album = null;
    let duration = null;
    for (const run of runs) {
      if (run.navigationEndpoint?.browseEndpoint?.browseId?.startsWith("UC")) {
        artists.push({ name: run.text, id: run.navigationEndpoint.browseEndpoint.browseId });
      } else if (run.navigationEndpoint?.browseEndpoint?.browseId?.startsWith("MPRE") || run.navigationEndpoint?.browseEndpoint?.browseId?.startsWith("OLAK")) {
        album = { name: run.text, id: run.navigationEndpoint.browseEndpoint.browseId };
      } else if (/^\d+:\d+$/.test(run.text)) {
        duration = run.text;
      }
    }
    if (artists.length === 0 && runs.length > 0) {
      const validRuns = runs.filter((r) => r.text !== " • ");
      if (validRuns.length > 0) {
        artists.push({ name: validRuns[0].text, id: "" });
      }
      if (validRuns.length > 1 && !album) ;
    }
    searchResult.artists = artists;
    searchResult.album = album;
    searchResult.duration = duration;
    searchResult.imageUrl = proxyThumbnail(searchResult.thumbnails?.[searchResult.thumbnails.length - 1]?.url);
  } else if (resultType === "video") {
    searchResult.type = "video";
    searchResult.videoId = nav(data, ["playNavigationEndpoint", "watchEndpoint", "videoId"], true);
    searchResult.title = nav(data, ["title", "runs", 0, "text"], true) || getItemText(data, 0);
    searchResult.thumbnails = nav(data, ["thumbnail", "musicThumbnailRenderer", "thumbnail", "thumbnails"], true);
    let runs = nav(data, ["subtitle", "runs"]);
    if (!runs) {
      const flexItem = getFlexColumnItem(data, 1);
      runs = nav(flexItem, ["text", "runs"], true) || [];
    }
    const artists = [];
    let views = "";
    let duration = "";
    for (const run of runs) {
      if (run.navigationEndpoint?.browseEndpoint?.browseId?.startsWith("UC")) {
        artists.push({ name: run.text, id: run.navigationEndpoint.browseEndpoint.browseId });
      } else if (run.text.includes("views")) {
        views = run.text.split(" ")[0];
      } else if (/^\d+:\d+$/.test(run.text)) {
        duration = run.text;
      }
    }
    if (artists.length === 0 && runs.length > 0) {
      const validRuns = runs.filter((r) => r.text !== " • ");
      if (validRuns.length > 0) artists.push({ name: validRuns[0].text, id: "" });
    }
    searchResult.artists = artists;
    searchResult.views = views;
    searchResult.duration = duration;
    searchResult.imageUrl = proxyThumbnail(searchResult.thumbnails?.[searchResult.thumbnails.length - 1]?.url);
  }
  if (searchResult.thumbnails && searchResult.thumbnails.length > 0) {
    searchResult.imageUrl = proxyThumbnail(searchResult.thumbnails[searchResult.thumbnails.length - 1].url);
  }
  return searchResult;
}
async function getHome(limit = 10) {
  console.log("[YTMusicApi] Fetching home (limit:", limit, ")...");
  const body = { browseId: "FEmusic_home" };
  const data = await innertubeRequest("browse", body);
  const sections = extractShelfRenderers(data);
  console.log(`[YTMusicApi] Initial home sections: ${sections.length}`);
  try {
    const sectionList = data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer;
    if (sectionList?.continuations) {
      let ctoken = sectionList.continuations?.[0]?.nextContinuationData?.continuation;
      let iterations = 0;
      const maxIterations = Math.max(0, limit - sections.length);
      while (ctoken && iterations < maxIterations) {
        const additionalParams = `&ctoken=${ctoken}&continuation=${ctoken}`;
        const contResponse = await innertubeRequest("browse", body, additionalParams);
        const contSections = contResponse?.continuationContents?.sectionListContinuation;
        if (!contSections?.contents) break;
        for (const section of contSections.contents) {
          const shelf = section?.musicCarouselShelfRenderer || section?.musicImmersiveCarouselShelfRenderer;
          if (!shelf) continue;
          const header = shelf.header?.musicCarouselShelfBasicHeaderRenderer || shelf.header?.musicImmersiveCarouselShelfBasicHeaderRenderer;
          const title = header?.title?.runs?.[0]?.text || "Untitled";
          const items = (shelf.contents || []).map((item) => {
            const twoRow = item?.musicTwoRowItemRenderer;
            if (twoRow) return extractItemFromRenderer(twoRow);
            const listItem = item?.musicResponsiveListItemRenderer;
            if (listItem) return parseFlatSong(listItem);
            return null;
          }).filter(Boolean);
          if (items.length > 0) {
            sections.push({
              id: title.replace(/\s+/g, "_").toLowerCase(),
              title,
              contents: items,
              items
            });
          }
        }
        ctoken = contSections.continuations?.[0]?.nextContinuationData?.continuation || null;
        iterations++;
        console.log(`[YTMusicApi] Loaded continuation ${iterations}, total sections: ${sections.length}`);
      }
    }
  } catch (e) {
    console.error("[YTMusicApi] Error loading home continuations:", e);
  }
  console.log(`[YTMusicApi] Total home sections loaded: ${sections.length}`);
  return sections;
}
async function search(query, filter, scope, ignoreSpelling = false) {
  console.log(`[YTMusicApi] Searching: '${query}' (filter: ${filter}, scope: ${scope})`);
  const body = { query };
  const params = getSearchParams(filter, scope, ignoreSpelling);
  if (params) {
    body.params = params;
  }
  const data = await innertubeRequest("search", body);
  const searchResults = [];
  if (!data?.contents) return searchResults;
  let results;
  if (data.contents.tabbedSearchResultsRenderer) {
    const tabs = data.contents.tabbedSearchResultsRenderer.tabs;
    const tabIndex = scope === "uploads" ? 1 : 0;
    results = tabs[tabIndex]?.tabRenderer?.content;
  } else {
    results = data.contents;
  }
  const sectionList = nav(results, ["sectionListRenderer", "contents"], true);
  if (!sectionList) return searchResults;
  let resultType;
  if (filter && filter.includes("playlists")) {
    resultType = "playlist";
  } else if (scope === "uploads") {
    resultType = "upload";
  } else if (filter) {
    resultType = filter.slice(0, -1);
  }
  for (const res of sectionList) {
    let category;
    if (res.musicCardShelfRenderer) {
      const shelf = res.musicCardShelfRenderer;
      const topResult = parseSearchResult(shelf, void 0, "Top result");
      searchResults.push(topResult);
      const contents = shelf.contents;
      if (contents) {
        for (const item of contents) {
          if (item.musicResponsiveListItemRenderer) {
            searchResults.push(parseSearchResult(item.musicResponsiveListItemRenderer, "song", "More from YouTube"));
          }
        }
      }
    } else if (res.musicShelfRenderer) {
      const shelf = res.musicShelfRenderer;
      category = nav(shelf, ["title", "runs", 0, "text"], true);
      let shelfResultType = resultType;
      if (!shelfResultType && category) {
        const lowerCat = category.toLowerCase();
        if (lowerCat === "songs") shelfResultType = "song";
        else if (lowerCat === "videos") shelfResultType = "video";
        else if (lowerCat === "albums") shelfResultType = "album";
        else if (lowerCat === "artists") shelfResultType = "artist";
        else if (lowerCat === "playlists") shelfResultType = "playlist";
        else if (lowerCat === "community playlists") shelfResultType = "playlist";
      }
      const items = shelf.contents || [];
      for (const item of items) {
        if (item.musicResponsiveListItemRenderer) {
          searchResults.push(parseSearchResult(item.musicResponsiveListItemRenderer, shelfResultType, category));
        }
      }
    }
  }
  console.log(`[YTMusicApi] Found ${searchResults.length} search results`);
  return searchResults;
}
async function getSearchSuggestions(query, detailedRuns = false) {
  const body = { input: query };
  const data = await innertubeRequest("music/get_search_suggestions", body);
  const rawSuggestions = nav(data, ["contents", 0, "searchSuggestionsSectionRenderer", "contents"], true) || [];
  const suggestions = [];
  for (const raw of rawSuggestions) {
    if (raw.historySuggestionRenderer) {
      const renderer = raw.historySuggestionRenderer;
      const text = nav(renderer, ["navigationEndpoint", "searchEndpoint", "query"], true);
      const runs = nav(renderer, ["suggestion", "runs"], true);
      if (detailedRuns) {
        suggestions.push({
          text,
          runs,
          fromHistory: true
        });
      } else {
        suggestions.push(text);
      }
    } else if (raw.searchSuggestionRenderer) {
      const renderer = raw.searchSuggestionRenderer;
      const text = nav(renderer, ["navigationEndpoint", "searchEndpoint", "query"], true);
      const runs = nav(renderer, ["suggestion", "runs"], true);
      if (detailedRuns) {
        suggestions.push({
          text,
          runs,
          fromHistory: false
        });
      } else {
        suggestions.push(text);
      }
    }
  }
  return suggestions;
}
async function getUserPlaylists() {
  console.log("[YTMusicApi] Fetching user playlists...");
  const data = await innertubeRequest("browse", { browseId: "FEmusic_liked_playlists" });
  const sections = extractShelfRenderers(data);
  const allItems = [];
  for (const section of sections) {
    allItems.push(...(section.items || section.contents || []).filter(
      (item) => item.type === "playlist" || item.type === "album" || item.type === "watch_playlist"
    ));
  }
  if (allItems.length === 0) {
    try {
      const tabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs || [];
      for (const tab of tabs) {
        const grid = tab?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.gridRenderer;
        if (!grid) continue;
        for (const item of grid.items || []) {
          const renderer = item?.musicTwoRowItemRenderer;
          if (!renderer) continue;
          allItems.push(extractItemFromRenderer(renderer));
        }
      }
    } catch (e) {
      console.error("[YTMusicApi] Error extracting library playlists:", e);
    }
  }
  return allItems;
}
function extractChannelSongs(data) {
  const tracks = [];
  try {
    const tabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs || [];
    for (const tab of tabs) {
      const sectionList = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      for (const section of sectionList) {
        const musicShelf = section?.musicShelfRenderer;
        if (musicShelf?.contents) {
          for (const item of musicShelf.contents) {
            const renderer = item?.musicResponsiveListItemRenderer;
            if (renderer) {
              const track = parsePlaylistItem(renderer);
              if (track && track.videoId && track.title) {
                tracks.push(track);
              }
            }
          }
        }
        const carousel = section?.musicCarouselShelfRenderer;
        if (carousel?.contents) {
          for (const item of carousel.contents) {
            const twoRow = item?.musicTwoRowItemRenderer;
            if (twoRow) {
              const parsed = extractItemFromRenderer(twoRow);
              if (parsed && parsed.type === "song" && parsed.videoId) {
                tracks.push(parsed);
              }
            }
            const listItem = item?.musicResponsiveListItemRenderer;
            if (listItem) {
              const track = parseFlatSong(listItem);
              if (track && track.videoId && track.title) {
                tracks.push(track);
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("[YTMusicApi] Error extracting channel songs:", e);
  }
  return tracks;
}
async function getPlaylistDetails(playlistId) {
  console.log("[YTMusicApi] Fetching playlist:", playlistId);
  const directBrowsePrefixes = ["MPRE", "UC", "MPSP", "FE", "VL"];
  const isDirectBrowse = directBrowsePrefixes.some((p) => playlistId.startsWith(p));
  const isChannel = playlistId.startsWith("UC");
  const browseId = isDirectBrowse ? playlistId : `VL${playlistId}`;
  const idType = isChannel ? "channel" : playlistId.startsWith("MPRE") ? "album" : "playlist";
  console.log("[YTMusicApi] Using browseId:", browseId, `(${idType})`);
  const data = await innertubeRequest("browse", { browseId });
  const topKeys = Object.keys(data || {});
  console.log("[YTMusicApi] Response top-level keys:", topKeys.join(", "));
  if (data?.contents) {
    console.log("[YTMusicApi] contents keys:", Object.keys(data.contents).join(", "));
  }
  const twoCol = data?.contents?.twoColumnBrowseResultsRenderer;
  const headerData = twoCol?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0];
  if (twoCol) {
    console.log("[YTMusicApi] twoCol found, secondaryContents:", !!twoCol?.secondaryContents);
    const secContents = twoCol?.secondaryContents?.sectionListRenderer?.contents?.[0];
    if (secContents) {
      console.log("[YTMusicApi] secondaryContents[0] keys:", Object.keys(secContents).join(", "));
    }
  }
  let header = null;
  if (headerData?.musicEditablePlaylistDetailHeaderRenderer) {
    const editable = headerData.musicEditablePlaylistDetailHeaderRenderer;
    header = editable.header?.musicResponsiveHeaderRenderer || editable.header?.musicDetailHeaderRenderer || editable;
  } else if (headerData?.musicResponsiveHeaderRenderer) {
    header = headerData.musicResponsiveHeaderRenderer;
  }
  if (!header) {
    header = data?.header?.musicImmersiveHeaderRenderer || data?.header?.musicDetailHeaderRenderer || data?.header?.musicVisualHeaderRenderer || data?.header?.musicResponsiveHeaderRenderer || {};
  }
  const title = header?.title?.runs?.[0]?.text || "YouTube Music Playlist";
  const subtitleRuns = header?.subtitle?.runs || header?.straplineTextOne?.runs || [];
  const subtitle = subtitleRuns.map((r) => r.text).join("");
  const thumbnails = header?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || header?.foregroundThumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || header?.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails || [];
  const imageUrl = proxyThumbnail(thumbnails.length > 0 ? thumbnails[thumbnails.length - 1]?.url : "");
  let tracks;
  if (isChannel) {
    tracks = extractChannelSongs(data);
    console.log(`[YTMusicApi] Channel '${title}': ${tracks.length} songs extracted from shelves`);
  } else {
    tracks = extractPlaylistTracks(data);
    console.log(`[YTMusicApi] Playlist '${title}': ${tracks.length} tracks extracted`);
  }
  return {
    id: playlistId,
    title,
    subtitle,
    imageUrl,
    thumbnails,
    trackCount: tracks.length,
    tracks
  };
}
async function getSongDetails(videoId) {
  console.log("[YTMusicApi] Fetching song details:", videoId);
  const data = await innertubeRequest("player", { videoId });
  const details = data?.videoDetails || {};
  const thumbs = details.thumbnail?.thumbnails || [];
  return {
    id: details.videoId || videoId,
    title: details.title || "",
    artists: details.author || "",
    durationMs: (parseInt(details.lengthSeconds) || 0) * 1e3,
    durationSeconds: parseInt(details.lengthSeconds) || 0,
    imageUrl: proxyThumbnail(thumbs.length > 0 ? thumbs[thumbs.length - 1]?.url : ""),
    thumbnails: thumbs,
    videoId: details.videoId || videoId
  };
}
async function getWatchPlaylist(videoId, playlistId, limit = 25, radio = false) {
  console.log("[YTMusicApi] Fetching watch playlist for:", videoId, radio ? "(radio)" : "");
  const body = {
    enablePersistentPlaylistPanel: true,
    isAudioOnly: true,
    tunerSettingValue: "AUTOMIX_SETTING_NORMAL"
  };
  if (videoId) {
    body.videoId = videoId;
    if (radio) {
      body.playlistId = `RDAMVM${videoId}`;
    } else if (playlistId) {
      body.playlistId = playlistId;
    }
  }
  const data = await innertubeRequest("next", body);
  const result = {
    tracks: [],
    playlistId: null,
    lyrics: null,
    related: null
  };
  try {
    const watchNext = data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs || [];
    const upNextTab = watchNext[0]?.tabRenderer?.content?.musicQueueRenderer;
    const playlistPanel = upNextTab?.content?.playlistPanelRenderer;
    if (playlistPanel) {
      result.playlistId = playlistPanel.playlistId || null;
      for (const item of playlistPanel.contents || []) {
        const renderer = item?.playlistPanelVideoRenderer;
        if (!renderer) continue;
        const title = nav(renderer, ["title", "runs", "0", "text"]) || "";
        const vid = renderer.videoId || nav(renderer, ["navigationEndpoint", "watchEndpoint", "videoId"]) || "";
        const lengthText = nav(renderer, ["lengthText", "runs", "0", "text"]) || "";
        const bylineRuns = nav(renderer, ["longBylineText", "runs"]) || [];
        const artists = [];
        let album = null;
        for (const run of bylineRuns) {
          const browseId = nav(run, ["navigationEndpoint", "browseEndpoint", "browseId"], true);
          if (browseId) {
            if (browseId.startsWith("MPRE")) {
              album = { name: run.text, id: browseId };
            } else if (browseId.startsWith("UC")) {
              artists.push({ name: run.text, id: browseId });
            }
          }
        }
        if (artists.length === 0 && bylineRuns.length > 0) {
          artists.push({ name: bylineRuns[0]?.text || "Unknown", id: "" });
        }
        const durationParts = lengthText.split(":").map(Number);
        let durationSeconds = 0;
        if (durationParts.length === 2) durationSeconds = durationParts[0] * 60 + durationParts[1];
        else if (durationParts.length === 3) durationSeconds = durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2];
        const thumbnails = nav(renderer, ["thumbnail", "thumbnails"]) || [];
        const imageUrl = proxyThumbnail(thumbnails.length > 0 ? thumbnails[thumbnails.length - 1]?.url : "");
        result.tracks.push({
          type: "song",
          title,
          videoId: vid,
          artists,
          album,
          duration: lengthText,
          durationMs: durationSeconds * 1e3,
          durationSeconds,
          thumbnails,
          imageUrl,
          id: vid
        });
      }
    }
    if (watchNext[1]) {
      const lyricsEndpoint = nav(watchNext, ["1", "tabRenderer", "endpoint", "browseEndpoint", "browseId"], true);
      result.lyrics = lyricsEndpoint || null;
    }
    if (watchNext[2]) {
      const relatedEndpoint = nav(watchNext, ["2", "tabRenderer", "endpoint", "browseEndpoint", "browseId"], true);
      result.related = relatedEndpoint || null;
    }
  } catch (e) {
    console.error("[YTMusicApi] Error parsing watch playlist:", e);
  }
  console.log(`[YTMusicApi] Watch playlist: ${result.tracks.length} tracks, related: ${result.related}`);
  return result;
}
async function getSongRelated(browseId) {
  console.log("[YTMusicApi] Fetching song related:", browseId);
  const data = await innertubeRequest("browse", { browseId });
  const sections = [];
  try {
    const contents = data?.contents?.sectionListRenderer?.contents || [];
    for (const section of contents) {
      const shelf = section?.musicCarouselShelfRenderer || section?.musicDescriptionShelfRenderer;
      if (section?.musicDescriptionShelfRenderer) {
        const desc = section.musicDescriptionShelfRenderer;
        const title2 = nav(desc, ["header", "musicCarouselShelfBasicHeaderRenderer", "title", "runs", "0", "text"]) || nav(desc, ["header", "runs", "0", "text"]) || "About";
        sections.push({
          title: title2,
          contents: nav(desc, ["description", "runs", "0", "text"]) || ""
        });
        continue;
      }
      if (!shelf) continue;
      const header = shelf.header?.musicCarouselShelfBasicHeaderRenderer;
      const title = header?.title?.runs?.[0]?.text || "Related";
      const items = [];
      for (const item of shelf.contents || []) {
        const twoRow = item?.musicTwoRowItemRenderer;
        if (twoRow) {
          const parsed = extractItemFromRenderer(twoRow);
          if (parsed) items.push(parsed);
          continue;
        }
        const listItem = item?.musicResponsiveListItemRenderer;
        if (listItem) {
          const parsed = parseFlatSong(listItem);
          if (parsed) items.push(parsed);
        }
      }
      if (items.length > 0) {
        sections.push({ title, contents: items });
      }
    }
  } catch (e) {
    console.error("[YTMusicApi] Error parsing song related:", e);
  }
  console.log(`[YTMusicApi] Song related: ${sections.length} sections`);
  return sections;
}
function initYTMusicHandlers() {
  console.log("[YTMusicHandler] Initializing...");
  electron.ipcMain.handle("ytmusic:is-authenticated", () => {
    return isAuthenticated();
  });
  electron.ipcMain.handle("ytmusic:logout", async () => {
    clearCookies();
    try {
      const loginSession = electron.session.fromPartition("persist:ytmusic_login");
      await loginSession.clearStorageData();
    } catch (e) {
      console.error("[YTMusicHandler] Failed to clear webview session:", e);
    }
    return { success: true };
  });
  electron.ipcMain.handle("ytmusic:get-home", async () => {
    try {
      return await getHome();
    } catch (error) {
      console.error("[YTMusicHandler] get-home error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("ytmusic:get-playlists", async () => {
    try {
      return await getUserPlaylists();
    } catch (error) {
      console.error("[YTMusicHandler] get-playlists error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("ytmusic:get-playlist", async (_, playlistId) => {
    try {
      return await getPlaylistDetails(playlistId);
    } catch (error) {
      console.error("[YTMusicHandler] get-playlist error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("ytmusic:search", async (_, query, options) => {
    try {
      return await search(query, options?.filter, options?.scope, options?.ignoreSpelling);
    } catch (error) {
      console.error("[YTMusicHandler] search error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("ytmusic:get-search-suggestions", async (_, query, detailedRuns) => {
    try {
      return await getSearchSuggestions(query, detailedRuns);
    } catch (error) {
      console.error("[YTMusicHandler] get-search-suggestions error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("ytmusic:get-song", async (_, videoId) => {
    try {
      return await getSongDetails(videoId);
    } catch (error) {
      console.error("[YTMusicHandler] get-song error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("ytmusic:get-watch-playlist", async (_, videoId, playlistId, radio) => {
    try {
      return await getWatchPlaylist(videoId, playlistId, 25, radio || false);
    } catch (error) {
      console.error("[YTMusicHandler] get-watch-playlist error:", error.message);
      throw error;
    }
  });
  electron.ipcMain.handle("ytmusic:get-song-related", async (_, browseId) => {
    try {
      return await getSongRelated(browseId);
    } catch (error) {
      console.error("[YTMusicHandler] get-song-related error:", error.message);
      throw error;
    }
  });
}
electron.app.commandLine.appendSwitch("ignore-certificate-errors");
electron.protocol.registerSchemesAsPrivileged([
  { scheme: "thumb-cache", privileges: { standard: false, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);
let _cacheDir = null;
let _cacheSettingsFile = null;
const CACHE_DIR_GETTER = () => {
  if (!_cacheDir) _cacheDir = path$1.join(electron.app.getPath("userData"), "audio-cache");
  return _cacheDir;
};
const CACHE_SETTINGS_FILE_GETTER = () => {
  if (!_cacheSettingsFile) _cacheSettingsFile = path$1.join(electron.app.getPath("userData"), "cache-settings.json");
  return _cacheSettingsFile;
};
const DEFAULT_CACHE_SETTINGS = {
  enabled: true,
  maxSizeMB: 500
};
const INITIAL_PROXY_PORT = 47831;
let currentProxyPort = INITIAL_PROXY_PORT;
let proxyServer = null;
const startProxyServer = () => {
  if (proxyServer) return;
  proxyServer = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || "", `http://localhost:${currentProxyPort}`);
      const pathname = reqUrl.pathname;
      if (pathname === "/stream") {
        const videoId = reqUrl.searchParams.get("id");
        const quality = reqUrl.searchParams.get("quality") || "720";
        if (!videoId) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing id parameter");
          return;
        }
        const isDev2 = !electron.app.isPackaged;
        const ffmpegPath = isDev2 ? path$1.join(__dirname, "../bin/ffmpeg.exe") : path$1.join(process.resourcesPath, "bin", "ffmpeg.exe");
        console.log(`[Proxy] Streaming video: ${videoId} (${quality}p)`);
        console.log(`[Proxy] Using ffmpeg from: ${ffmpegPath}`);
        const formatSelector = `bv*[height<=${quality}]+ba/b[height<=${quality}]/b`;
        const args = [
          `https://www.youtube.com/watch?v=${videoId}`,
          "-o",
          "-",
          // Output to stdout
          "--format",
          formatSelector,
          "--ffmpeg-location",
          ffmpegPath,
          "--merge-output-format",
          "mkv",
          // MKV/WebM is streamable and supports VP9/Opus
          "--no-warnings",
          "--no-check-certificate",
          "--no-progress",
          "--quiet",
          "--user-agent",
          ELECTRON_USER_AGENT
        ];
        const ytProcess = child_process.spawn(ytDlpPath, args);
        res.writeHead(200, {
          "Content-Type": "video/webm",
          "Access-Control-Allow-Origin": "*"
          // 'Transfer-Encoding': 'chunked'
        });
        ytProcess.stdout.pipe(res);
        ytProcess.stderr.on("data", (data) => {
          const msg = data.toString();
          if (msg.includes("Error") || msg.includes("headers")) {
            console.error(`[Proxy] yt-dlp stderr: ${msg}`);
          }
        });
        ytProcess.on("error", (err) => {
          console.error("[Proxy] Process error:", err);
          if (!res.headersSent) {
            res.writeHead(500);
            res.end("Stream process error");
          }
        });
        req.on("close", () => {
          console.log("[Proxy] Client disconnected, killing process");
          ytProcess.kill();
        });
        return;
      }
      if (pathname === "/audio") {
        const videoId = reqUrl.searchParams.get("id");
        const quality = reqUrl.searchParams.get("quality") || "high";
        if (!videoId) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing id parameter");
          return;
        }
        console.log(`[Proxy] Streaming audio: ${videoId} (quality: ${quality})`);
        let formatSelector = "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best";
        if (quality === "medium") {
          formatSelector = "bestaudio[abr<=128][ext=m4a]/bestaudio[abr<=128]/bestaudio";
        } else if (quality === "low") {
          formatSelector = "worstaudio[ext=m4a]/worstaudio";
        }
        const args = [
          `https://www.youtube.com/watch?v=${videoId}`,
          "-o",
          "-",
          // Output to stdout
          "--format",
          formatSelector,
          "--no-warnings",
          "--no-check-certificate",
          "--user-agent",
          ELECTRON_USER_AGENT,
          "--no-playlist"
        ];
        const ytProcess = child_process.spawn(ytDlpPath, args);
        res.writeHead(200, {
          "Content-Type": "audio/mp4",
          // m4a is audio/mp4
          "Access-Control-Allow-Origin": "*",
          "Transfer-Encoding": "chunked",
          "Cache-Control": "no-cache"
        });
        ytProcess.stdout.pipe(res);
        ytProcess.stderr.on("data", (data) => {
          const msg = data.toString();
          if (msg.includes("ERROR") || msg.includes("error")) {
            console.error(`[Proxy] yt-dlp audio error: ${msg}`);
          }
        });
        ytProcess.on("error", (err) => {
          console.error("[Proxy] Audio process error:", err);
          if (!res.headersSent) {
            res.writeHead(500);
            res.end("Audio stream process error");
          }
        });
        ytProcess.on("close", (code) => {
          if (code !== 0 && code !== null) {
            console.error(`[Proxy] yt-dlp exited with code ${code}`);
          }
        });
        req.on("close", () => {
          console.log("[Proxy] Audio client disconnected, killing process");
          ytProcess.kill();
        });
        return;
      }
      if (pathname === "/playlist") {
        const videoId = reqUrl.searchParams.get("id");
        if (!videoId) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing id parameter");
          return;
        }
        console.log(`[Proxy] Generating HLS playlist for: ${videoId}`);
        try {
          const args = [
            `https://www.youtube.com/watch?v=${videoId}`,
            "--dump-single-json",
            "--no-warnings",
            "--no-check-certificate",
            "--user-agent",
            ELECTRON_USER_AGENT
          ];
          const ytProcess = child_process.spawn(ytDlpPath, args);
          let jsonOutput = "";
          ytProcess.stdout.on("data", (data) => {
            jsonOutput += data.toString();
          });
          ytProcess.on("close", (code) => {
            if (code !== 0) {
              res.writeHead(500, { "Content-Type": "text/plain" });
              res.end("Failed to get video info");
              return;
            }
            try {
              const output = JSON.parse(jsonOutput);
              const muxedFormats = (output.formats || []).filter(
                (f) => f.vcodec !== "none" && f.acodec !== "none" && f.url && f.height
              ).sort((a, b) => (b.height || 0) - (a.height || 0));
              if (muxedFormats.length === 0) {
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("No muxed formats available");
                return;
              }
              let m3u8 = "#EXTM3U\n";
              m3u8 += "#EXT-X-VERSION:3\n";
              for (const format of muxedFormats) {
                const bandwidth = format.tbr ? Math.round(format.tbr * 1e3) : format.height * 3e3;
                const resolution = `${format.width || format.height * 16 / 9}x${format.height}`;
                const proxyUrl = `http://localhost:${currentProxyPort}/proxy?url=${encodeURIComponent(format.url)}`;
                m3u8 += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution},NAME="${format.height}p"
`;
                m3u8 += `${proxyUrl}
`;
              }
              res.writeHead(200, {
                "Content-Type": "application/vnd.apple.mpegurl",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache"
              });
              res.end(m3u8);
              console.log(`[Proxy] Generated HLS playlist with ${muxedFormats.length} qualities`);
            } catch (parseError) {
              console.error("[Proxy] Failed to parse yt-dlp output:", parseError);
              res.writeHead(500, { "Content-Type": "text/plain" });
              res.end("Failed to parse video info");
            }
          });
          ytProcess.on("error", (err) => {
            console.error("[Proxy] yt-dlp error:", err);
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Failed to start yt-dlp");
          });
          return;
        } catch (error) {
          console.error("[Proxy] Playlist error:", error);
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end(`Playlist error: ${error.message}`);
          return;
        }
      }
      const targetUrl = reqUrl.searchParams.get("url");
      if (!targetUrl) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing url or id parameter");
        return;
      }
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": ELECTRON_USER_AGENT,
          "Referer": "https://www.youtube.com/",
          "Origin": "https://www.youtube.com"
        }
      });
      if (!response.ok) {
        res.writeHead(response.status);
        res.end(`Upstream error: ${response.status}`);
        return;
      }
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      const headers = {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*"
      };
      if (req.method === "OPTIONS") {
        res.writeHead(204, headers);
        res.end();
        return;
      }
      if (targetUrl.includes(".m3u8") || contentType.includes("mpegurl")) {
        let content = await response.text();
        content = content.replace(/^(https?:\/\/[^\s]+)/gm, (match) => {
          return `http://localhost:${currentProxyPort}/proxy?url=${encodeURIComponent(match)}`;
        });
        res.writeHead(200, headers);
        res.end(content);
      } else {
        const buffer = Buffer.from(await response.arrayBuffer());
        res.writeHead(200, { ...headers, "Content-Length": buffer.length.toString() });
        res.end(buffer);
      }
    } catch (error) {
      console.error("[HLS Proxy] Error:", error.message);
      res.writeHead(500);
      res.end(`Proxy error: ${error.message}`);
    }
  });
  proxyServer.listen(currentProxyPort, () => {
    console.log(`[Proxy] Server running on port ${currentProxyPort}`);
  });
  proxyServer.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`[Proxy] Port ${currentProxyPort} in use, trying next port`);
      currentProxyPort++;
      proxyServer?.listen(currentProxyPort);
    } else {
      console.error("[Proxy] Server error:", err);
    }
  });
};
const ensureCacheDir = () => {
  if (!fs$1.existsSync(CACHE_DIR_GETTER())) {
    fs$1.mkdirSync(CACHE_DIR_GETTER(), { recursive: true });
  }
};
const getCacheSettings = () => {
  try {
    if (fs$1.existsSync(CACHE_SETTINGS_FILE_GETTER())) {
      const data = fs$1.readFileSync(CACHE_SETTINGS_FILE_GETTER(), "utf-8");
      return { ...DEFAULT_CACHE_SETTINGS, ...JSON.parse(data) };
    }
  } catch (e) {
    console.error("Error reading cache settings:", e);
  }
  return DEFAULT_CACHE_SETTINGS;
};
const saveCacheSettings = (settings) => {
  try {
    fs$1.writeFileSync(CACHE_SETTINGS_FILE_GETTER(), JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error("Error saving cache settings:", e);
  }
};
const getCacheEntries = () => {
  ensureCacheDir();
  const entries = [];
  try {
    const files = fs$1.readdirSync(CACHE_DIR_GETTER());
    const metaFiles = files.filter((f) => f.endsWith(".meta.json"));
    for (const metaFile of metaFiles) {
      const key = metaFile.replace(".meta.json", "");
      const audioPath = path$1.join(CACHE_DIR_GETTER(), `${key}.audio`);
      const metaPath = path$1.join(CACHE_DIR_GETTER(), metaFile);
      if (fs$1.existsSync(audioPath)) {
        try {
          const metadata = JSON.parse(fs$1.readFileSync(metaPath, "utf-8"));
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
      fs$1.unlinkSync(entry.audioPath);
      fs$1.unlinkSync(path$1.join(CACHE_DIR_GETTER(), `${entry.key}.meta.json`));
      freedBytes += entry.metadata.size;
      console.log(`[Cache] Evicted: ${entry.key} (${entry.metadata.size} bytes)`);
    } catch (e) {
      console.error(`Error evicting ${entry.key}:`, e);
    }
  }
};
electron.ipcMain.handle("cache-get", async (_, key) => {
  try {
    const audioPath = path$1.join(CACHE_DIR_GETTER(), `${key}.audio`);
    if (fs$1.existsSync(audioPath)) {
      const data = fs$1.readFileSync(audioPath);
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
    const audioPath = path$1.join(CACHE_DIR_GETTER(), `${key}.audio`);
    const metaPath = path$1.join(CACHE_DIR_GETTER(), `${key}.meta.json`);
    const fullMetadata = {
      trackId: "",
      searchQuery: "",
      ...metadata,
      cachedAt: Date.now(),
      size: dataSize
    };
    fs$1.writeFileSync(audioPath, Buffer.from(data));
    fs$1.writeFileSync(metaPath, JSON.stringify(fullMetadata, null, 2));
    console.log(`[Cache] STORED: ${key} (${dataSize} bytes)`);
    return true;
  } catch (e) {
    console.error("Cache put error:", e);
    return false;
  }
});
electron.ipcMain.handle("cache-delete", async (_, key) => {
  try {
    const audioPath = path$1.join(CACHE_DIR_GETTER(), `${key}.audio`);
    const metaPath = path$1.join(CACHE_DIR_GETTER(), `${key}.meta.json`);
    if (fs$1.existsSync(audioPath)) fs$1.unlinkSync(audioPath);
    if (fs$1.existsSync(metaPath)) fs$1.unlinkSync(metaPath);
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
    const files = fs$1.readdirSync(CACHE_DIR_GETTER());
    for (const file of files) {
      fs$1.unlinkSync(path$1.join(CACHE_DIR_GETTER(), file));
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
const SONG_PREFS_FILE = path$1.join(electron.app.getPath("userData"), "song-preferences.json");
const loadSongPreferences = () => {
  try {
    if (fs$1.existsSync(SONG_PREFS_FILE)) {
      const data = fs$1.readFileSync(SONG_PREFS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error loading song preferences:", e);
  }
  return {};
};
const saveSongPreferences = (prefs) => {
  try {
    fs$1.writeFileSync(SONG_PREFS_FILE, JSON.stringify(prefs, null, 2));
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
const LYRICS_PREFS_FILE = path$1.join(electron.app.getPath("userData"), "lyrics-preferences.json");
const loadLyricsPreferences = () => {
  try {
    if (fs$1.existsSync(LYRICS_PREFS_FILE)) {
      const data = fs$1.readFileSync(LYRICS_PREFS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error loading lyrics preferences:", e);
  }
  return {};
};
const saveLyricsPreferences = (prefs) => {
  try {
    fs$1.writeFileSync(LYRICS_PREFS_FILE, JSON.stringify(prefs, null, 2));
  } catch (e) {
    console.error("Error saving lyrics preferences:", e);
  }
};
electron.ipcMain.handle("lyrics-pref-get", async (_, trackKey) => {
  try {
    const prefs = loadLyricsPreferences();
    return prefs[trackKey] || null;
  } catch (e) {
    console.error("Lyrics pref get error:", e);
    return null;
  }
});
electron.ipcMain.handle(
  "lyrics-pref-set",
  async (_, trackKey, preference) => {
    try {
      const prefs = loadLyricsPreferences();
      prefs[trackKey] = {
        ...preference,
        savedAt: Date.now()
      };
      saveLyricsPreferences(prefs);
      console.log(`[LyricsPref] Saved preference for: ${trackKey}`);
      return true;
    } catch (e) {
      console.error("Lyrics pref set error:", e);
      return false;
    }
  }
);
electron.ipcMain.handle("lyrics-pref-delete", async (_, trackKey) => {
  try {
    const prefs = loadLyricsPreferences();
    if (prefs[trackKey]) {
      delete prefs[trackKey];
      saveLyricsPreferences(prefs);
      console.log(`[LyricsPref] Deleted preference for: ${trackKey}`);
    }
    return true;
  } catch (e) {
    console.error("Lyrics pref delete error:", e);
    return false;
  }
});
let _savedPlaylistsFile = null;
const getSavedPlaylistsFile = () => {
  if (!_savedPlaylistsFile) _savedPlaylistsFile = path$1.join(electron.app.getPath("userData"), "saved-playlists.json");
  return _savedPlaylistsFile;
};
let _playlistTracksFile = null;
const getPlaylistTracksFile = () => {
  if (!_playlistTracksFile) _playlistTracksFile = path$1.join(electron.app.getPath("userData"), "playlist-tracks.json");
  return _playlistTracksFile;
};
const loadSavedPlaylists = () => {
  try {
    if (fs$1.existsSync(getSavedPlaylistsFile())) {
      const data = fs$1.readFileSync(getSavedPlaylistsFile(), "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error loading saved playlists:", e);
  }
  return [];
};
const savePlaylists = (playlists) => {
  try {
    fs$1.writeFileSync(getSavedPlaylistsFile(), JSON.stringify(playlists, null, 2));
  } catch (e) {
    console.error("Error saving playlists:", e);
  }
};
electron.ipcMain.handle("saved-playlists-get", async () => {
  try {
    return loadSavedPlaylists();
  } catch (e) {
    console.error("Saved playlists get error:", e);
    return [];
  }
});
electron.ipcMain.handle("saved-playlists-add", async (_, playlist) => {
  try {
    const playlists = loadSavedPlaylists();
    if (playlists.some((p) => p.id === playlist.id)) {
      console.log(`[Library] Playlist already saved: ${playlist.name}`);
      return true;
    }
    playlists.unshift({ ...playlist, savedAt: Date.now() });
    savePlaylists(playlists);
    console.log(`[Library] Added playlist: ${playlist.name}`);
    return true;
  } catch (e) {
    console.error("Saved playlists add error:", e);
    return false;
  }
});
electron.ipcMain.handle("saved-playlists-remove", async (_, playlistId) => {
  try {
    const playlists = loadSavedPlaylists();
    const filtered = playlists.filter((p) => p.id !== playlistId);
    savePlaylists(filtered);
    console.log(`[Library] Removed playlist: ${playlistId}`);
    return true;
  } catch (e) {
    console.error("Saved playlists remove error:", e);
    return false;
  }
});
electron.ipcMain.handle("saved-playlists-check", async (_, playlistId) => {
  try {
    const playlists = loadSavedPlaylists();
    return playlists.some((p) => p.id === playlistId);
  } catch (e) {
    console.error("Saved playlists check error:", e);
    return false;
  }
});
const loadPlaylistTracks = () => {
  try {
    if (fs$1.existsSync(getPlaylistTracksFile())) {
      const data = fs$1.readFileSync(getPlaylistTracksFile(), "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error loading playlist tracks:", e);
  }
  return {};
};
const savePlaylistTracks = (data) => {
  try {
    fs$1.writeFileSync(getPlaylistTracksFile(), JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error saving playlist tracks:", e);
  }
};
electron.ipcMain.handle("playlist-tracks-get", async (_, playlistId) => {
  try {
    const allTracks = loadPlaylistTracks();
    return allTracks[playlistId] || [];
  } catch (e) {
    console.error("Playlist tracks get error:", e);
    return [];
  }
});
electron.ipcMain.handle("playlist-tracks-add", async (_, playlistId, track) => {
  try {
    const allTracks = loadPlaylistTracks();
    if (!allTracks[playlistId]) allTracks[playlistId] = [];
    if (!allTracks[playlistId].some((t) => t.id === track.id)) {
      allTracks[playlistId].push(track);
      savePlaylistTracks(allTracks);
      const playlists = loadSavedPlaylists();
      const pl = playlists.find((p) => p.id === playlistId);
      if (pl) {
        pl.trackCount = allTracks[playlistId].length;
        savePlaylists(playlists);
      }
      console.log(`[Library] Added track "${track.name}" to playlist ${playlistId}`);
    }
    return true;
  } catch (e) {
    console.error("Playlist tracks add error:", e);
    return false;
  }
});
electron.ipcMain.handle("playlist-tracks-remove", async (_, playlistId, trackId) => {
  try {
    const allTracks = loadPlaylistTracks();
    if (allTracks[playlistId]) {
      allTracks[playlistId] = allTracks[playlistId].filter((t) => t.id !== trackId);
      savePlaylistTracks(allTracks);
      const playlists = loadSavedPlaylists();
      const pl = playlists.find((p) => p.id === playlistId);
      if (pl) {
        pl.trackCount = allTracks[playlistId].length;
        savePlaylists(playlists);
      }
    }
    return true;
  } catch (e) {
    console.error("Playlist tracks remove error:", e);
    return false;
  }
});
let _spotifyStorageFile = null;
const getSpotifyStorageFile = () => {
  if (!_spotifyStorageFile) _spotifyStorageFile = path$1.join(electron.app.getPath("userData"), "spotify-session.json");
  return _spotifyStorageFile;
};
const saveSpotifySession = (session2) => {
  try {
    fs$1.writeFileSync(SPOTIFY_STORAGE_FILE, JSON.stringify(session2, null, 2));
    console.log("[Spotify] Session saved");
  } catch (e) {
    console.error("Error saving Spotify session:", e);
  }
};
const loadSpotifySession = () => {
  try {
    if (fs$1.existsSync(getSpotifyStorageFile())) {
      return JSON.parse(fs$1.readFileSync(getSpotifyStorageFile(), "utf-8"));
    }
  } catch (e) {
    console.error("Error loading Spotify session:", e);
  }
  return null;
};
process.env.DIST = path$1.join(__dirname, "../dist");
process.env.VITE_PUBLIC = electron.app.isPackaged ? process.env.DIST : path$1.join(__dirname, "../public");
let win;
let tray = null;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const isDev = !electron.app.isPackaged;
const prodPath = path$1.join(process.resourcesPath, "bin", "yt-dlp.exe");
const devPath = path$1.join(__dirname, "../bin/yt-dlp.exe");
const ytDlpPath = isDev ? devPath : prodPath;
if (!isDev && !fs$1.existsSync(ytDlpPath)) {
  electron.dialog.showErrorBox("Critical Error", `yt-dlp.exe missing at:
${ytDlpPath}`);
}
const ELECTRON_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
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
  startProxyServer();
  win = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path$1.join(process.env.VITE_PUBLIC || "", "electron-vite.svg"),
    autoHideMenuBar: true,
    frame: false,
    // Frameless window for custom title bar
    titleBarStyle: "hidden",
    // Hide native title bar
    titleBarOverlay: {
      // Windows: Show native window controls (minimize, maximize, close) with custom styling
      color: "#121212",
      // Background color of title bar overlay
      symbolColor: "#ffffff",
      // Color of window control icons
      height: 40
      // Height of the title bar area
    },
    backgroundColor: "#121212",
    webPreferences: {
      preload: path$1.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });
  win.setMenuBarVisibility(false);
  if (electron.app.isPackaged) {
    win.webContents.on("before-input-event", (event, input) => {
      if (input.key === "F12") {
        event.preventDefault();
      }
      if (input.control && input.shift && ["I", "J", "C"].includes(input.key)) {
        event.preventDefault();
      }
    });
  }
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
      requestHeaders["User-Agent"] = ELECTRON_USER_AGENT;
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
      item.setSavePath(path$1.join(electron.app.getPath("downloads"), options.filename));
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
    win.loadFile(path$1.join(process.env.DIST || "", "index.html"));
  }
  if (!tray) {
    const publicDir = process.env.VITE_PUBLIC || "";
    const iconIco = path$1.join(publicDir, "icon.ico");
    const iconPng = path$1.join(publicDir, "icon.png");
    console.log("[Tray] Looking for icons at:", { iconIco, iconPng });
    let trayIcon = null;
    if (fs$1.existsSync(iconIco)) {
      console.log("[Tray] Found .ico");
      trayIcon = electron.nativeImage.createFromPath(iconIco);
    } else if (fs$1.existsSync(iconPng)) {
      console.log("[Tray] Found .png");
      const image = electron.nativeImage.createFromPath(iconPng);
      trayIcon = image.resize({ width: 16, height: 16 });
    } else {
      console.log("[Tray] No icon found, using fallback base64");
      const iconDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADfSURBVDiNpZMxDoJAEEXfLhYmFjZewMbGxMQLeBN7C2+gd7Cx9AYcwNLL2GhjZ2dBQmICsptQCJBlJ5Ns8f/szOwfYKG1fkhBLoANsAMiYGcavsLME7AH4tQnhMBDAGugBlrmWQEBsAXutNYnM/8K7A1rlFJlEi+B+H8MEbABbrXWRynnBRb/JQihYg4wBrrm/hxomLlvYEFmDuwDG6BttN4FXGQZEAPXQNnMbcKQKaVKJdADQq31ycRChh4wABpG6x0hjYGhuT8DamYOZv6aWMjLwNDcHwNV8/cBeAe/iyFO7WBXRQAAAABJRU5ErkJggg==";
      trayIcon = electron.nativeImage.createFromDataURL(iconDataUrl);
    }
    if (trayIcon) {
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
      "--no-check-certificate",
      "--format",
      formatSelector
    ];
    const output = await runYtDlp(args);
    if (!output || !output.url) throw new Error("No stream URL found");
    console.log(`[YouTube] Returning direct audio URL for: ${videoId}`);
    return {
      url: output.url,
      // Direct YouTube URL for seeking support
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
electron.ipcMain.handle("youtube-video-stream", async (_, videoId, maxHeight = 1080) => {
  try {
    console.log(`[YouTube] Fetching Video Stream for: ${videoId} (Max Height: ${maxHeight}p)`);
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const args = [
      url,
      "--dump-single-json",
      "--no-warnings",
      "--no-check-certificate",
      "--user-agent",
      ELECTRON_USER_AGENT
    ];
    const output = await runYtDlp(args);
    if (!output) throw new Error("No data returned from yt-dlp");
    let hlsUrl = output.manifest_url;
    if (!hlsUrl && output.formats) {
      const hlsFormat = output.formats.find(
        (f) => f.protocol === "m3u8" || f.protocol === "m3u8_native" || f.url && f.url.includes(".m3u8")
      );
      if (hlsFormat) {
        hlsUrl = hlsFormat.url;
      }
    }
    if (hlsUrl) {
      console.log(`[YouTube] Found HLS manifest for adaptive quality`);
      const proxyUrl = `http://localhost:${currentProxyPort}/proxy?url=${encodeURIComponent(hlsUrl)}`;
      return {
        type: "hls",
        url: proxyUrl,
        isHls: true,
        title: output.title,
        duration: output.duration,
        thumbnail: output.thumbnail,
        qualities: ["auto", "1080p", "720p", "480p", "360p", "240p"]
        // HLS has all
      };
    }
    console.log(`[YouTube] No native HLS, using yt-dlp piped streaming`);
    const videoFormats = output.formats?.filter(
      (f) => f.vcodec !== "none" && f.height && f.height >= 144
      // Filter out tiny formats
    ).sort((a, b) => (b.height || 0) - (a.height || 0)) || [];
    const heightSet = new Set(videoFormats.map((f) => f.height));
    const allHeights = Array.from(heightSet).filter((h) => h && h >= 144).sort((a, b) => b - a);
    if (allHeights.length > 0) {
      const selectedHeight = allHeights.find((h) => h <= maxHeight) || allHeights[allHeights.length - 1];
      const availableQualities = allHeights.map((h) => `${h}p`);
      const streamUrl = `http://localhost:${currentProxyPort}/stream?id=${videoId}&quality=${selectedHeight}`;
      console.log(`[YouTube] Returning ${selectedHeight}p piped stream (${availableQualities.length} qualities: ${availableQualities.slice(0, 5).join(", ")}...)`);
      return {
        type: "muxed",
        url: streamUrl,
        // Piped through yt-dlp with on-the-fly merging
        isHls: false,
        height: selectedHeight,
        format: "webm",
        title: output.title,
        duration: output.duration,
        thumbnail: output.thumbnail,
        qualities: availableQualities
      };
    }
    console.log(`[YouTube] No formats available, trying fallback formats 22/18`);
    const fallbackArgs = [
      url,
      "--dump-single-json",
      "--no-warnings",
      "--no-check-certificate",
      "--format",
      "22/18",
      "--user-agent",
      ELECTRON_USER_AGENT
    ];
    const fallbackOutput = await runYtDlp(fallbackArgs);
    if (fallbackOutput?.url) {
      const proxyUrl = `http://localhost:${currentProxyPort}/proxy?url=${encodeURIComponent(fallbackOutput.url)}`;
      return {
        type: "muxed",
        url: proxyUrl,
        isHls: false,
        height: fallbackOutput.height || 360,
        format: "mp4",
        title: fallbackOutput.title,
        duration: fallbackOutput.duration,
        thumbnail: fallbackOutput.thumbnail,
        qualities: [`${fallbackOutput.height || 360}p`]
      };
    }
    throw new Error("No video URL found");
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
  if (fs$1.existsSync(SPOTIFY_STORAGE_FILE)) {
    fs$1.unlinkSync(SPOTIFY_STORAGE_FILE);
  }
  return { success: true };
});
electron.ipcMain.handle("ytmusic-login", async () => {
  return new Promise((resolve, reject) => {
    const authWindow = new electron.BrowserWindow({
      width: 900,
      height: 700,
      show: true,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: "persist:ytmusic_login",
        webSecurity: false
      }
    });
    const authSession = authWindow.webContents.session;
    authWindow.loadURL("https://accounts.google.com/ServiceLogin?service=youtube&continue=https://music.youtube.com/");
    let isResolved = false;
    const checkLoginSuccess = async () => {
      if (isResolved || authWindow.isDestroyed()) return;
      try {
        const currentUrl = authWindow.webContents.getURL();
        const isOnYTMusic = currentUrl.includes("music.youtube.com");
        if (isOnYTMusic) {
          const allCookies = await authSession.cookies.get({ url: "https://music.youtube.com" });
          const hasSID = allCookies.some((c) => c.name === "SID");
          const hasSAPISID = allCookies.some((c) => c.name === "SAPISID" || c.name === "__Secure-3PAPISID");
          if (hasSID && hasSAPISID) {
            const cookieString = allCookies.map((c) => `${c.name}=${c.value}`).join("; ");
            console.log("[YTMusic Auth] Login detected! Cookies:", allCookies.map((c) => c.name).join(", "));
            isResolved = true;
            clearInterval(cookieCheckInterval);
            setCookies(cookieString);
            setTimeout(() => {
              if (!authWindow.isDestroyed()) authWindow.close();
            }, 500);
            resolve({ success: true });
          }
        }
      } catch (error) {
        console.error("[YTMusic Auth] Check error:", error);
      }
    };
    const cookieCheckInterval = setInterval(checkLoginSuccess, 2e3);
    authWindow.on("closed", () => {
      clearInterval(cookieCheckInterval);
      if (!isResolved) {
        reject(new Error("Login cancelled by user"));
      }
    });
  });
});
initYTMusicHandlers();
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
  registerThumbProtocol();
  restoreSession();
  initSpotifyHandlers();
  createWindow();
});
