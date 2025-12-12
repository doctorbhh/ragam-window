import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

export function useSpotifyData() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchRecentlyPlayed = async (userId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('spotify-data', {
        body: { action: 'fetch_recently_played', userId },
      });

      if (error) throw error;
      return data.data.recently_played;
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
      const { data, error } = await supabase.functions.invoke('spotify-data', {
        body: { action: 'fetch_liked_songs', userId },
      });

      if (error) throw error;
      return data.data.liked_songs;
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
      const { data, error } = await supabase.functions.invoke('spotify-data', {
        body: { action: 'fetch_playlists', userId },
      });

      if (error) throw error;
      return data.data.playlists;
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
      const { data, error } = await supabase.functions.invoke('ai-recommendations', {
        body: { userId },
      });

      if (error) throw error;
      
      toast({
        title: "Success",
        description: "AI recommendations generated successfully!",
      });
      
      return data.recommendations;
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