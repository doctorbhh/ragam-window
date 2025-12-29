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
      console.log('[Hook] Liked data from IPC:', JSON.stringify(likedData?.items?.[0] || 'EMPTY', null, 2));
      setLikedSongs(likedData.items || []);

      // Recently played endpoint causes 429 errors (no GraphQL equivalent available)
      // Disabling for now to avoid rate limits
      setRecentlyPlayed([]);
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