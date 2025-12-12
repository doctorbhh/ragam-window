import { useState, useEffect } from "react";
import { getUserPlaylists, getSavedTracks } from "@/services/spotifyservice";
import { useSpotifyAuth } from "@/context/SpotifyAuthContext";
import { SpotifyPlaylist, SpotifyTrackItem } from "@/types/spotify";

export const useSpotifyPlaylists = () => {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [likedSongs, setLikedSongs] = useState<SpotifyTrackItem[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { spotifyToken, isAuthenticated } = useSpotifyAuth();

  useEffect(() => {
    if (isAuthenticated && spotifyToken) {
      fetchUserData();
    } else {
      // Clear data when logged out
      setPlaylists([]);
      setLikedSongs([]);
      setRecentlyPlayed([]);
    }
  }, [isAuthenticated, spotifyToken]);

  const fetchUserData = async () => {
    if (!spotifyToken) return;

    setLoading(true);
    try {
      // Fetch playlists
      const playlistsData = await getUserPlaylists(spotifyToken);
      setPlaylists(playlistsData.items || []);

      // Fetch liked songs
      const likedData = await getSavedTracks(spotifyToken, 0, 20);
      setLikedSongs(likedData.items || []);

      // Fetch recently played tracks
      const recentResponse = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=6", {
        headers: {
          Authorization: `Bearer ${spotifyToken}`,
        },
      });
      if (recentResponse.ok) {
        const recentData = await recentResponse.json();
        setRecentlyPlayed(recentData.items || []);
      }
    } catch (error) {
      console.error("Error fetching Spotify data:", error);
    } finally {
      setLoading(false);
    }
  };

  return {
    playlists,
    likedSongs,
    recentlyPlayed,
    loading,
    refetch: fetchUserData,
  };
};