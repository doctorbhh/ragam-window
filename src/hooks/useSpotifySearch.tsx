import { useState } from "react";
import { searchTracks } from "@/services/spotifyservice";
import { useSpotifyAuth } from "@/context/SpotifyAuthContext";
import { toast } from "sonner";

export const useSpotifySearch = () => {
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const { spotifyToken } = useSpotifyAuth();

  const search = async (query: string) => {
    if (!spotifyToken) {
      toast.error("Please login to search songs");
      return [];
    }

    if (!query.trim()) {
      setSearchResults([]);
      return [];
    }

    setSearching(true);
    try {
      const data = await searchTracks(spotifyToken, query);
      const tracks = data.tracks?.items || [];
      setSearchResults(tracks);
      return tracks;
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Failed to search songs");
      return [];
    } finally {
      setSearching(false);
    }
  };

  return { search, searching, searchResults };
};