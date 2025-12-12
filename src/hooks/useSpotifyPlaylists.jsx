import { useState, useEffect } from "react";
import { getUserPlaylists, getSavedTracks } from "@/services/spotifyservice";
import { useSpotifyAuth } from "@/context/SpotifyAuthContext";

export const useSpotifyPlaylists = () => {
  const [playlists, setPlaylists] = useState([]);
  const [likedSongs, setLikedSongs] = useState([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const [loading, setLoading] = useState(false);
  const { spotifyToken, isAuthenticated } = useSpotifyAuth();

  useEffect(() => {
    if (isAuthenticated && spotifyToken) {
      fetchUserData();
    } else {
      setPlaylists([]);
      setLikedSongs([]);
      setRecentlyPlayed([]);
    }
  }, [isAuthenticated, spotifyToken]);

  const fetchUserData = async () => {
    if (!spotifyToken) return;

    setLoading(true);
    try {
      const playlistsData = await getUserPlaylists(spotifyToken);
      setPlaylists(playlistsData.items || []);

      const likedData = await getSavedTracks(spotifyToken, 0, 20);
      setLikedSongs(likedData.items || []);

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
