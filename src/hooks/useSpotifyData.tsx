import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";

export function useSpotifyData() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Helper to safely call Electron IPC
  const safeIpcCall = async (method: string, ...args: any[]) => {
    try {
      // @ts-ignore
      if (window.electron && window.electron.spotify && typeof window.electron.spotify[method] === 'function') {
        // @ts-ignore
        return await window.electron.spotify[method](...args);
      }
      console.warn(`Electron IPC method ${method} not available`);
      return null;
    } catch (error) {
      console.error(`Error calling ${method}:`, error);
      throw error;
    }
  };

  const fetchRecentlyPlayed = async (userId: string) => {
    try {
      setLoading(true);
      // Use getRecentlyPlayed from Electron
      // Note: userId arg is ignored as the backend uses the authenticated session
      const data = await safeIpcCall('getRecentlyPlayed', 50); 
      return data?.items || [];
    } catch (error) {
      console.error('Error fetching recently played:', error);
      toast({
        title: "Error",
        description: "Failed to fetch recently played tracks.",
        variant: "destructive",
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchLikedSongs = async (userId: string) => {
    try {
      setLoading(true);
      // Use getSavedTracks from Electron
      const data = await safeIpcCall('getSavedTracks', 50);
      return data?.items || [];
    } catch (error) {
      console.error('Error fetching liked songs:', error);
      toast({
        title: "Error",
        description: "Failed to fetch liked songs.",
        variant: "destructive",
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchPlaylists = async (userId: string) => {
    try {
      setLoading(true);
      // Use getMyPlaylists from Electron
      const data = await safeIpcCall('getMyPlaylists', 50);
      return data?.items || [];
    } catch (error) {
      console.error('Error fetching playlists:', error);
      toast({
        title: "Error",
        description: "Failed to fetch playlists.",
        variant: "destructive",
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getAIRecommendations = async (userId: string) => {
    try {
      setLoading(true);
      // Use getRecommendations from Electron
      // Note: This requires seeds. For now, let's use a default or empty object if not provided
      // The original code passed userId, but getRecommendations needs seeds.
      // We might need to fetch some top tracks to use as seeds.
      
      const topTracks = await safeIpcCall('getTopTracks', 'short_term', 5);
      const seedTracks = topTracks?.items?.map((t: any) => t.id).slice(0, 5) || [];
      
      const data = await safeIpcCall('getRecommendations', { seed_tracks: seedTracks });

      if (!data) throw new Error("No data returned");
      
      toast({
        title: "Success",
        description: "AI recommendations generated successfully!",
      });
      
      return data;
    } catch (error) {
      console.error('Error getting AI recommendations:', error);
      toast({
        title: "Error",
        description: "Failed to generate AI recommendations.",
        variant: "destructive",
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const syncSpotifyData = async (userId: string) => {
    try {
      setLoading(true);
      
      // Fetch all data types in parallel
      const [recentlyPlayed, likedSongs, playlists] = await Promise.all([
        fetchRecentlyPlayed(userId),
        fetchLikedSongs(userId),
        fetchPlaylists(userId),
      ]);
      
      toast({
        title: "Sync Complete",
        description: "Your Spotify data has been synced successfully!",
      });
      
      return {
        recentlyPlayed,
        likedSongs,
        playlists,
      };
    } catch (error) {
      console.error('Error syncing Spotify data:', error);
      toast({
        title: "Sync Failed",
        description: "Failed to sync Spotify data. Please try again.",
        variant: "destructive",
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    fetchRecentlyPlayed,
    fetchLikedSongs,
    fetchPlaylists,
    getAIRecommendations,
    syncSpotifyData,
  };
}