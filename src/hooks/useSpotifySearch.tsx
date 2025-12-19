import { useState } from "react";
import { searchTracks, searchAlbums } from "@/services/spotifyservice";
import { useSpotifyAuth } from "@/context/SpotifyAuthContext";
import { toast } from "sonner";

export const useSpotifySearch = () => {
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [albumResults, setAlbumResults] = useState<any[]>([]);
  const { spotifyToken } = useSpotifyAuth();

  const search = async (query: string) => {
    if (!spotifyToken) {
      toast.error("Please login to search songs");
      return [];
    }

    if (!query.trim()) {
      setSearchResults([]);
      setAlbumResults([]);
      return [];
    }

    setSearching(true);
    try {
      // Search for both tracks and albums in parallel
      const [trackData, albumData] = await Promise.all([
        searchTracks(spotifyToken, query),
        searchAlbums(spotifyToken, query)
      ]);
      
      const tracks = trackData.tracks?.items || [];
      const albums = albumData.albums?.items || [];
      
      console.log('[useSpotifySearch] Album search result:', albumData);
      console.log('[useSpotifySearch] Albums found:', albums.length, albums);
      
      setSearchResults(tracks);
      setAlbumResults(albums);
      return tracks;
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Failed to search songs");
      return [];
    } finally {
      setSearching(false);
    }
  };

  return { search, searching, searchResults, albumResults };
};