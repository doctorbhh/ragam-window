import { getSearchProvider, getAudioQuality } from "./instanceService";

const JIOSAAVN_API_URL = 'https://jiosavan-ytify.vercel.app/api/search/songs';

// Unified Audio URL Fetcher
export const getAudioUrlForTrack = async (track) => {
  const provider = getSearchProvider(); // 'youtube' or 'jiosaavn'

  if (provider === 'jiosaavn') {
    return await getJioSaavnAudioUrl(track);
  } else {
    // USE SPOTUBE TECHNIQUE (VIA ELECTRON)
    return await getYouTubeAudioUrl(track);
  }
};

// Unified Search Function
export const smartSearch = async (query) => {
  const provider = getSearchProvider();

  if (provider === 'jiosaavn') {
    return await searchJioSaavn(query);
  } else {
    // USE ELECTRON HANDLER
    return await searchYouTube(query);
  }
};

// ==========================================
// --- YOUTUBE IMPLEMENTATION ---
// ==========================================

const getYouTubeAudioUrl = async (track) => {
  try {
    // 1. Check for existing URL
    if (track.url) return track.url;

    let videoId = track.id;

    // 2. "Match" Logic (Equivalent to Spotube's matches() function)
    // If we don't have a valid 11-char YouTube ID, we must search for it.
    if (!videoId || videoId.length !== 11) {
      const artistNames = track.artists ? track.artists.map(a => a.name).join(' ') : (track.channelTitle || '');

      // Exact same search query format as Spotube: "${track.name} ${artists}"
      const searchQuery = `${track.name || track.title} ${artistNames}`;
      console.log("Match Strategy: Searching for...", searchQuery);

      // Call Electron Main Process to do the heavy lifting
      const searchResults = await window.electron.youtube.search(searchQuery);

      if (!searchResults || searchResults.length === 0) {
        throw new Error("No matching videos found on YouTube");
      }

      // Spotube Logic: "The first match is considered the best match."
      videoId = searchResults[0].id;
    }

    // 3. "Stream" Logic (Equivalent to Spotube's streams() function)
    console.log("Spotube Stream Strategy: Fetching manifest for", videoId);
    const streamData = await window.electron.youtube.getStream(videoId);

    if (!streamData || !streamData.url) {
      throw new Error("Failed to extract audio stream");
    }

    return streamData.url;

  } catch (error) {
    console.error("YouTube Logic Error:", error);
    throw error;
  }
};

export const searchYouTube = async (query) => {
  try {
    // Use the Electron Bridge instead of Piped Fetch
    return await window.electron.youtube.search(query);
  } catch (error) {
    console.error("YouTube search failed:", error);
    return [];
  }
};


// ==========================================
// --- JIO SAAVN IMPLEMENTATION (KEPT AS IS) ---
// ==========================================

const getJioSaavnAudioUrl = async (track) => {
  if (track.url) return track.url;

  let results = [];

  try {
    const artistName = track.artists && track.artists[0] ? track.artists[0].name : "";
    const query = `${track.name || track.title} ${artistName}`.trim();

    if (query) {
      results = await searchJioSaavn(query);
    }
  } catch (error) {
    console.warn("JioSaavn strict search failed, attempting retry...", error);
  }

  if (!results || results.length === 0) {
    console.log("Retrying JioSaavn search with song name only...");
    try {
      const retryQuery = (track.name || track.title || "").trim();
      if (retryQuery) {
        results = await searchJioSaavn(retryQuery);
      }
    } catch (error) {
      console.warn("JioSaavn retry search failed:", error);
    }
  }

  if (!results || results.length === 0) {
    throw new Error("Track not found on JioSaavn");
  }

  return results[0].url;
};

const searchJioSaavn = async (query) => {
  try {
    const response = await fetch(`${JIOSAAVN_API_URL}?query=${encodeURIComponent(query)}&page=0&limit=10`);
    if (!response.ok) throw new Error("JioSaavn search failed");

    const data = await response.json();
    const results = data.data?.results || data.results || data.data || [];

    if (!Array.isArray(results)) return [];

    return results.map(item => {
      const image = Array.isArray(item.image)
        ? item.image[item.image.length - 1]?.link || item.image[item.image.length - 1]?.url
        : item.image;

      let downloadUrl = null;
      if (Array.isArray(item.downloadUrl)) {
        downloadUrl = item.downloadUrl[item.downloadUrl.length - 1]?.link || item.downloadUrl[item.downloadUrl.length - 1]?.url;
      } else {
        downloadUrl = item.downloadUrl;
      }

      let artists = [];
      if (item.artists?.primary) {
        artists = item.artists.primary.map(a => ({ name: a.name }));
      } else if (Array.isArray(item.artists)) {
        artists = item.artists.map(a => typeof a === 'string' ? { name: a } : { name: a.name });
      } else if (typeof item.primaryArtists === 'string') {
        artists = [{ name: item.primaryArtists }];
      }

      return {
        id: item.id || Math.random().toString(36),
        title: item.name || item.title,
        name: item.name || item.title,
        thumbnail: image,
        channelTitle: artists[0]?.name || 'Unknown Artist',
        duration: typeof item.duration === 'string' ? parseInt(item.duration) : item.duration,
        url: downloadUrl,
        isOfficial: true,
        artists: artists
      };
    });
  } catch (error) {
    console.error("JioSaavn search error:", error);
    return [];
  }
};