"use strict";
const electron = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const child_process = require("child_process");
electron.app.commandLine.appendSwitch("ignore-certificate-errors");
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
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(process.env.DIST || "", "index.html"));
  }
}
electron.ipcMain.handle("youtube-search", async (_, query, region = "US") => {
  try {
    console.log(`[YouTube Music] Searching: ${query} (Region: ${region})`);
    const searchUrl = `https://music.youtube.com/search?q=${encodeURIComponent(query)}`;
    const args = [
      searchUrl,
      "--dump-single-json",
      "--playlist-items",
      "1,2,3,4,5",
      // Limit to top 5 results
      "--flat-playlist",
      // Get metadata quickly without downloading
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
      // YTM results usually put the artist in 'uploader' or 'artist' fields
      channelTitle: entry.uploader || entry.artist || "YouTube Music",
      duration: entry.duration,
      // Force high-res thumbnail for YTM
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
        // Apply User Region to Fallback too
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
        const cookies = await authSession.cookies.get({
          name: "sp_dc"
        });
        if (cookies.length > 0) {
          const currentUrl = authWindow.webContents.getURL();
          if (currentUrl.includes("accounts.spotify.com")) {
            console.log("Login Cookie found! Redirecting to Player...");
            clearInterval(cookieInterval);
            await authWindow.loadURL("https://open.spotify.com");
          }
        }
      } catch (error) {
        console.error("Cookie check error:", error);
      }
    };
    const cookieInterval = setInterval(checkCookie, 1e3);
    try {
      authWindow.webContents.debugger.attach("1.3");
    } catch (err) {
      console.error("Debugger attach failed", err);
    }
    authWindow.webContents.debugger.on("message", async (event, method, params) => {
      if (method === "Network.responseReceived") {
        const url = params.response.url;
        if (url.includes("/api/token")) {
          try {
            const responseBody = await authWindow.webContents.debugger.sendCommand(
              "Network.getResponseBody",
              { requestId: params.requestId }
            );
            if (responseBody.body) {
              const data = JSON.parse(responseBody.body);
              if (data.accessToken) {
                console.log(">>> SUCCESS: Token Sniffed!");
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
      }
    });
    authWindow.webContents.debugger.sendCommand("Network.enable");
    authWindow.on("closed", () => {
      clearInterval(cookieInterval);
      if (!isResolved) console.log("Auth window closed by user");
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
