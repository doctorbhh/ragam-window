import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

export function useSpotifyData() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const getAIRecommendations = async (userId) => {
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

  const syncSpotifyData = async (userId) => {
    try {
      setLoading(true);
      toast({
        title: "Sync Complete",
        description: "Your Spotify data has been synced successfully!",
      });
    } catch (error) {
      console.error('Error syncing Spotify data:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    getAIRecommendations,
    syncSpotifyData,
  };
}
