"use strict";
const electron = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const child_process = require("child_process");
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
process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = electron.app.isPackaged ? process.env.DIST : path.join(__dirname, "../public");
let win;
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
    const checkCookie = async () => {
      if (isResolved || authWindow.isDestroyed()) return;
      try {
        const cookies = await authSession.cookies.get({ name: "sp_dc" });
        if (cookies.length > 0) {
          const currentUrl = authWindow.webContents.getURL();
          if (currentUrl.includes("accounts.spotify.com")) {
            clearInterval(cookieInterval);
            await authWindow.loadURL("https://open.spotify.com");
          }
        }
      } catch (error) {
        console.error(error);
      }
    };
    const cookieInterval = setInterval(checkCookie, 1e3);
    try {
      authWindow.webContents.debugger.attach("1.3");
    } catch (err) {
    }
    authWindow.webContents.debugger.on("message", async (event, method, params) => {
      if (method === "Network.responseReceived" && params.response.url.includes("/api/token")) {
        try {
          const res = await authWindow.webContents.debugger.sendCommand("Network.getResponseBody", {
            requestId: params.requestId
          });
          if (res.body) {
            const data = JSON.parse(res.body);
            if (data.accessToken) {
              isResolved = true;
              resolve(data);
              setTimeout(() => {
                if (!authWindow.isDestroyed()) authWindow.close();
              }, 500);
            }
          }
        } catch (err) {
        }
      }
    });
    authWindow.webContents.debugger.sendCommand("Network.enable");
    authWindow.on("closed", () => {
      clearInterval(cookieInterval);
      if (!isResolved) console.log("Auth closed");
    });
  });
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
electron.app.whenReady().then(createWindow);
