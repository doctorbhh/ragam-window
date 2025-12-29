import { useState } from "react";
import { searchTracks, searchAlbums, searchArtists, searchPlaylists } from "@/services/spotifyservice";
import { useSpotifyAuth } from "@/context/SpotifyAuthContext";
import { toast } from "sonner";

export type SearchType = 'all' | 'tracks' | 'albums' | 'artists' | 'playlists';

export const useSpotifySearch = () => {
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [albumResults, setAlbumResults] = useState<any[]>([]);
  const [artistResults, setArtistResults] = useState<any[]>([]);
  const [playlistResults, setPlaylistResults] = useState<any[]>([]);
  
  const { spotifyToken } = useSpotifyAuth();

  const search = async (query: string, type: SearchType = 'all') => {
    if (!spotifyToken) {
      toast.error("Please login to search");
      return;
    }

    if (!query.trim()) {
      setSearchResults([]);
      setAlbumResults([]);
      setArtistResults([]);
      setPlaylistResults([]);
      return;
    }

    setSearching(true);
    try {
      if (type === 'all') {
        const [trackData, albumData, artistData, playlistData] = await Promise.all([
          searchTracks(spotifyToken, query),
          searchAlbums(spotifyToken, query),
          searchArtists(spotifyToken, query),
          searchPlaylists(spotifyToken, query)
        ]);

        setSearchResults(trackData.tracks?.items || []);
        setAlbumResults(albumData.albums?.items || []);
        setArtistResults(artistData.artists?.items || []);
        setPlaylistResults(playlistData.playlists?.items || []);
      } else {
        // Targeted search
        switch (type) {
          case 'tracks':
            const tData = await searchTracks(spotifyToken, query);
            setSearchResults(tData.tracks?.items || []);
            break;
          case 'albums':
            const alData = await searchAlbums(spotifyToken, query);
            setAlbumResults(alData.albums?.items || []);
            break;
          case 'artists':
            const arData = await searchArtists(spotifyToken, query);
            setArtistResults(arData.artists?.items || []);
            break;
          case 'playlists':
            const pData = await searchPlaylists(spotifyToken, query);
            setPlaylistResults(pData.playlists?.items || []);
            break;
        }
      }
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Failed to search");
    } finally {
      setSearching(false);
    }
  };

  return { 
    search, 
    searching, 
    searchResults, 
    albumResults, 
    artistResults, 
    playlistResults 
  };
};