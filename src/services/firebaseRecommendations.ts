import {
  getDatabase,
  ref,
  set,
  get,
  serverTimestamp,
  query,
  orderByChild,
  limitToLast,
} from "firebase/database";
import { SpotifyTrack } from "@/types/spotify";

// --- Configuration ---
// Ensure you have VITE_GEMINI_API_KEY in your .env file
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

interface UserMusicProfile {
  userId: string;
  genres: Record<string, number>;
  artists: Record<string, number>;
  recentTracks: {
    id: string;
    name: string;
    artist: string;
    genres?: string[];
    playedAt: number;
  }[];
  lastUpdated: any;
}

export interface Recommendation {
  id: string;
  track_name: string;
  artist_name: string;
  reason: string;
  genres?: string[];
}

// Track user listening data with frequency analysis
export const trackListening = async (userId: string, track: SpotifyTrack) => {
  try {
    const db = getDatabase();
    const userProfileRef = ref(db, `userMusicProfiles/${userId}`);

    // Get existing profile
    const snapshot = await get(userProfileRef);
    let profile = snapshot.val() as UserMusicProfile;

    if (!profile) {
      profile = {
        userId,
        genres: {},
        artists: {},
        recentTracks: [],
        lastUpdated: null,
      };
    }

    const trackData = {
      id: track.id,
      name: track.name,
      artist: track.artists.map((a) => a.name).join(", "),
      playedAt: Date.now(),
    };

    // Update Artist Frequency
    const artists = profile.artists || {};
    track.artists.forEach((artist) => {
      artists[artist.name] = (artists[artist.name] || 0) + 1;
    });

    // Add track to recent tracks
    let recentTracks = profile.recentTracks || [];
    // Remove duplicates if the song was played recently
    recentTracks = recentTracks.filter((t) => t.id !== track.id);
    recentTracks.unshift(trackData as any);

    // Keep only last 50 tracks to save space
    const trimmedRecentTracks = recentTracks.slice(0, 50);

    await set(userProfileRef, {
      ...profile,
      artists,
      recentTracks: trimmedRecentTracks,
      lastUpdated: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error tracking listening:", error);
  }
};

// Get AI recommendations based on listening history
export const getAIRecommendations = async (
  userId: string
): Promise<Recommendation[]> => {
  try {
    const db = getDatabase();

    // 1. Fetch User Profile (Try new structure first)
    const profileRef = ref(db, `userMusicProfiles/${userId}`);
    const profileSnapshot = await get(profileRef);

    let topArtists: string[] = [];
    let recentTracks: string[] = [];

    if (profileSnapshot.exists()) {
      const profile = profileSnapshot.val();
      // Extract artists from the frequency map
      topArtists = Object.entries(profile.artists || {})
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 5)
        .map(([key]) => key);

      recentTracks = (profile.recentTracks || [])
        .slice(0, 5)
        .map((t: any) => `${t.name} by ${t.artist}`);
    } else {
      // Fallback: Check 'user_listening' (Old Structure for compatibility)
      const listeningRef = query(
        ref(db, `user_listening/${userId}`),
        orderByChild("played_at"),
        limitToLast(20)
      );
      const listeningSnapshot = await get(listeningRef);

      if (listeningSnapshot.exists()) {
        const tracks: any[] = [];
        listeningSnapshot.forEach((child) => {
          tracks.push(child.val());
        });

        recentTracks = tracks
          .reverse()
          .map((t) => `${t.name} by ${t.artist || "Unknown"}`);

        const artistCounts: Record<string, number> = {};
        tracks.forEach((t) => {
          if (t.artist)
            artistCounts[t.artist] = (artistCounts[t.artist] || 0) + 1;
        });
        topArtists = Object.keys(artistCounts)
          .sort((a, b) => artistCounts[b] - artistCounts[a])
          .slice(0, 5);
      }
    }

    if (topArtists.length === 0 && recentTracks.length === 0) {
      console.log("No listening history found.");
      return [];
    }

    // 3. Construct AI Prompt
    const prompt = `
      Based on the following user music taste, suggest 10 distinct song recommendations.
      
      User's Top Artists: ${topArtists.join(", ")}
      Recently Played: ${recentTracks.join(", ")}
      
      Return ONLY a raw JSON array (no markdown formatting) of objects with these fields:
      - "track_name": string
      - "artist_name": string
      - "reason": string (short explanation why it fits)
      - "genres": string[]
      
      Ensure suggestions are a mix of similar hits and hidden gems. Do NOT suggest songs listed in "Recently Played".
    `;

    // 4. Call Gemini API
    const recommendations = await fetchAIRecommendations(prompt);

    if (recommendations.length > 0) {
      const recommendationsRef = ref(db, `recommendations/${userId}`);
      await set(recommendationsRef, {
        userId,
        recommendations,
        generatedAt: serverTimestamp(),
      });
    }

    return recommendations;
  } catch (error) {
    console.error("Error getting recommendations:", error);
    return [];
  }
};

// --- Helper Functions ---

// Call Gemini API
const fetchAIRecommendations = async (
  prompt: string
): Promise<Recommendation[]> => {
  if (!API_KEY) {
    console.warn(
      "Gemini API Key is missing. Check your .env file (VITE_GEMINI_API_KEY)."
    );
    return [];
  }

  try {
    // Using gemini-1.5-flash for speed and efficiency
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: "application/json", // Forces JSON output
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API Error: ${response.statusText}`);
    }

    const data = await response.json();

    // Parse Gemini Response
    // Structure: candidates[0].content.parts[0].text
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      throw new Error("No content in Gemini response");
    }

    // Sanitize and parse JSON
    const jsonString = textResponse
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(jsonString);

    // Map to our Recommendation interface
    return parsed.map((item: any, index: number) => ({
      id: `rec_${Date.now()}_${index}`,
      track_name: item.track_name,
      artist_name: item.artist_name,
      reason: item.reason,
      genres: item.genres || [],
    }));
  } catch (error) {
    console.error("Failed to fetch from Gemini:", error);
    return [];
  }
};
