import { ref, push, set, get, query, orderByChild, limitToLast, serverTimestamp } from 'firebase/database';
import { db } from '@/lib/firebase';

// Ensure VITE_GEMINI_API_KEY is defined in your .env file
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

// Helper to call Gemini with a specific model
const callGeminiAPI = async (modelName, prompt) => {
  if (!API_KEY) throw new Error("Gemini API Key is missing.");

  // Using the v1beta endpoint which supports the latest models
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error?.message || JSON.stringify(errorData);
    } catch (e) { }

    const error = new Error(`Gemini API Error (${response.status}): ${errorMessage}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textResponse) throw new Error("No content in Gemini response");

  // Clean and parse JSON
  const jsonString = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(jsonString);
};

// Track a song play for recommendation engine
export const trackListening = async (userId, track) => {
  try {
    const listeningRef = ref(db, `user_listening/${userId}`);
    const newListeningRef = push(listeningRef);

    await set(newListeningRef, {
      track_id: track.id,
      track_name: track.name,
      artist_name: track.artists.map(a => a.name).join(', '),
      album_name: track.album?.name || '',
      played_at: Date.now(),
      duration_ms: track.duration_ms
    });

    console.log('Successfully tracked listening history');
  } catch (error) {
    console.error('Error tracking listening:', error);
  }
};

// Get AI recommendations with Fallback Strategy
export const getAIRecommendations = async (userId) => {

  try {
    // 1. Get user listening history
    const listeningQuery = query(
      ref(db, `user_listening/${userId}`),
      orderByChild('played_at'),
      limitToLast(50)
    );

    const snapshot = await get(listeningQuery);

    if (!snapshot.exists()) {
      console.log('No listening history found');
      return [];
    }

    const listeningHistory = [];
    snapshot.forEach((childSnapshot) => {
      listeningHistory.push(childSnapshot.val());
    });

    // 2. Analysis
    const recentPlays = [...listeningHistory].reverse();
    const recentTrackNames = recentPlays
      .slice(0, 5)
      .map(t => `${t.track_name} by ${t.artist_name}`);

    const artistCounts = {};
    recentPlays.forEach(t => {
      const artist = t.artist_name.split(',')[0].trim();
      artistCounts[artist] = (artistCounts[artist] || 0) + 1;
    });

    const topArtists = Object.entries(artistCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name]) => name);

    if (topArtists.length === 0) return [];

    // 3. Construct Prompt
    const prompt = `
      Based on the following user music taste, suggest 10 distinct song recommendations.
      
      User's Top Artists: ${topArtists.join(', ')}
      Recently Played: ${recentTrackNames.join(', ')}
      
      Return ONLY a raw JSON array (no markdown formatting) of objects with these fields:
      - "track_name": string
      - "artist_name": string
      - "reason": string (short explanation why it fits)
      - "genres": string[]
      
      Ensure suggestions are a mix of similar hits and hidden gems. Do NOT suggest songs listed in "Recently Played".
    `;

    // 4. Call Gemini API with Latest Models
    let recommendations = [];
    try {
      // Primary: Gemini 2.5 Flash (Current Stable)
      recommendations = await callGeminiAPI('gemini-2.5-flash', prompt);
      console.log(recommendations);
    } catch (error) {
      console.warn("Primary model failed, trying fallback...", error.message);
      if (error.status === 404 || error.status === 503) {
        try {
          // Fallback 1: Gemini 2.0 Flash (Previous Stable)
          recommendations = await callGeminiAPI('gemini-2.0-flash', prompt);
        } catch (fallbackError) {
          try {
            // Fallback 2: Gemini 1.5 Flash Latest (Legacy support if available)
            recommendations = await callGeminiAPI('gemini-1.5-flash-latest', prompt);
          } catch (finalError) {
            console.error("All model attempts failed:", finalError.message);
            return [];
          }
        }
      } else {
        return [];
      }
    }

    // Add temporary IDs
    return recommendations.map((rec, index) => ({
      ...rec,
      id: `rec_${Date.now()}_${index}`
    }));

  } catch (error) {
    console.error('Error in getAIRecommendations:', error);
    return [];
  }
};