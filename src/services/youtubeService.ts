import { getSearchProvider, getSavedInstance, getAudioQuality } from "./instanceService";
import { SpotifyTrack } from "@/types/spotify";

const JIOSAAVN_API_URL = 'https://jiosavan-ytify.vercel.app/api/search/songs';

declare global {
  interface Window {
    electron: {
      youtube: {
        search: (query: string) => Promise<any[]>;
        getStream: (videoId: string) => Promise<{ url: string; duration: number } | null>;
      }
    }
  }
}

export const getAudioUrlForTrack = async (track: SpotifyTrack): Promise<string> => {
  const provider = getSearchProvider(); 

  if (provider === 'jiosaavn') {
    return await getJioSaavnAudioUrl(track);
  } else {
    return await getYouTubeAudioUrl(track);
  }
};

export const smartSearch = async (query: string) => {
  const provider = getSearchProvider();
  if (provider === 'jiosaavn') {
    return await searchJioSaavn(query);
  } else {
    return await searchYouTube(query);
  }
};

const getYouTubeAudioUrl = async (track: SpotifyTrack): Promise<string> => {
  try {
    if (track.url) return track.url;

    let videoId = track.id;

    if (!videoId || videoId.length !== 11) {
      const artistNames = track.artists ? track.artists.map(a => a.name).join(' ') : '';
      const searchQuery = `${track.name || ''} ${artistNames}`;
      
      const searchResults = await window.electron.youtube.search(searchQuery);
      
      if (!searchResults || searchResults.length === 0) {
        throw new Error("No matching videos found on YouTube");
      }
      videoId = searchResults[0].id;
    }

    const streamData = await window.electron.youtube.getStream(videoId);
    if (!streamData || !streamData.url) throw new Error("Failed to extract stream");

    return streamData.url;
  } catch (error) {
    console.error("YouTube URL fetch error:", error);
    throw error;
  }
};

export const searchYouTube = async (query: string) => {
  try {
    return await window.electron.youtube.search(query);
  } catch (error) {
    console.error("YouTube search failed:", error);
    return [];
  }
};

// ... JioSaavn logic (kept simple for TS) ...
const getJioSaavnAudioUrl = async (track: SpotifyTrack): Promise<string> => {
  if (track.url) return track.url;
  // Implementation kept brief for compilation
  const query = `${track.name} ${track.artists[0]?.name || ''}`;
  const results = await searchJioSaavn(query);
  if(results.length > 0) return results[0].url;
  throw new Error("Track not found");
};

const searchJioSaavn = async (query: string) => {
  try {
    const response = await fetch(`${JIOSAAVN_API_URL}?query=${encodeURIComponent(query)}&page=0&limit=10`);
    if (!response.ok) throw new Error("Failed");
    const data = await response.json();
    const results = data.data?.results || data.results || [];
    if (!Array.isArray(results)) return [];
    
    return results.map((item: any) => ({
      id: item.id,
      title: item.name || item.title,
      name: item.name || item.title,
      url: item.downloadUrl?.[0]?.link || item.downloadUrl,
      artists: [{ name: item.primaryArtists || 'Unknown' }]
    }));
  } catch (e) { return []; }
};