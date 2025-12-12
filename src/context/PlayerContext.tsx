import React, { createContext, useState, useContext, useRef, useEffect } from "react";
import { SpotifyTrack } from "@/types/spotify";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSpotifyAuth } from "@/context/SpotifyAuthContext";
import { trackListening } from "@/services/firebaseRecommendations";

interface PlayerContextType {
  currentTrack: SpotifyTrack | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  isLoading: boolean;
  playTrack: (track: SpotifyTrack) => Promise<void>;
  togglePlayPause: () => void;
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  queue: SpotifyTrack[];
  addToQueue: (track: SpotifyTrack) => void;
  addManyToQueue: (tracks: SpotifyTrack[]) => void;
  clearQueue: () => void;
}

const PlayerContext = createContext<PlayerContextType>({
  currentTrack: null,
  isPlaying: false,
  progress: 0,
  duration: 0,
  volume: 70,
  isLoading: false,
  playTrack: async () => {},
  togglePlayPause: () => {},
  seekTo: () => {},
  setVolume: () => {},
  nextTrack: () => {},
  previousTrack: () => {},
  queue: [],
  addToQueue: () => {},
  addManyToQueue: () => {},
  clearQueue: () => {},
});

export const usePlayer = () => useContext(PlayerContext);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState<SpotifyTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(70);
  const [isLoading, setIsLoading] = useState(false);
  const [queue, setQueue] = useState<SpotifyTrack[]>([]);
  const queueRef = useRef<SpotifyTrack[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { user } = useSpotifyAuth();

  useEffect(() => {
    // Create audio element once
    audioRef.current = new Audio();
    audioRef.current.volume = volume / 100;
    
    const audio = audioRef.current;
    
    // Event listeners
    const handleTimeUpdate = () => {
      setProgress(audio.currentTime);
    };
    
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };
    
    const handleEnded = () => {
      setIsPlaying(false);
      // Automatically play next song in queue
      if (queueRef.current.length > 0) {
        setTimeout(() => nextTrack(), 500); // Small delay for smooth transition
      }
    };
    
    const handleError = (e: Event) => {
      console.error("Audio playback error:", e);
      toast.error("Failed to play track");
      setIsPlaying(false);
      setIsLoading(false);
    };
    
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
    };
  }, []);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // Track listening history using Firebase
  const trackListeningData = async (track: SpotifyTrack) => {
    if (!user) return;
    
    try {
      // Track in Firebase for AI recommendations
      await trackListening(user.id, track);
    } catch (error) {
      console.error('Error tracking listening:', error);
    }
  };

  const playTrack = async (track: SpotifyTrack) => {
    if (!audioRef.current) return;
    
    setIsLoading(true);
    setCurrentTrack(track);
    
    try {
      // Create search query for YouTube
      const searchQuery = `${track.name} ${track.artists.map(a => a.name).join(' ')}`;
      console.log(`Searching for: ${searchQuery}`);
      
      // Use YouTube search edge function to find the video
      const { data, error } = await supabase.functions.invoke('youtube-search', {
        body: { query: searchQuery }
      });
      
      if (error || !data?.videoId) {
        throw new Error(error?.message || 'No video found');
      }
      
      console.log(`Found video: ${data.title} (${data.videoId})`);
      
      // Call local scraper server to get audio URL
      const scraperResponse = await fetch(`http://localhost:3001/scrape?videoId=${data.videoId}`);
      
      if (!scraperResponse.ok) {
        throw new Error(`Scraper error: ${scraperResponse.status}`);
      }
      
      const scraperData = await scraperResponse.json();
      
      if (scraperData.error || !scraperData.url) {
        throw new Error(scraperData.error || 'No audio URL returned');
      }
      
      console.log('Audio URL obtained from scraper');
      
      // Set the audio source and play
      audioRef.current.src = scraperData.url;
      await audioRef.current.play();
      setIsPlaying(true);
      toast.success(`Now playing: ${track.name}`);
      
      // Track listening history for AI recommendations
      await trackListeningData(track);
      
    } catch (error) {
      console.error('Error playing track:', error);
      
      // Fallback to preview URL if available
      if (track.preview_url) {
        audioRef.current.src = track.preview_url;
        await audioRef.current.play();
        setIsPlaying(true);
        toast.info(`Playing preview: ${track.name}`);
      } else {
        toast.error('Failed to play track. Make sure server.js is running on port 3001');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const seekTo = (time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setProgress(time);
  };

  const setVolume = (newVolume: number) => {
    if (!audioRef.current) return;
    audioRef.current.volume = newVolume / 100;
    setVolumeState(newVolume);
  };

  const nextTrack = async () => {
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);
      await playTrack(next);
    }
  };

  const previousTrack = () => {
    if (audioRef.current && audioRef.current.currentTime > 3) {
      seekTo(0);
    }
  };

  const addToQueue = (track: SpotifyTrack) => {
    setQueue(prev => [...prev, track]);
    toast.success('Added to queue');
  };

  const addManyToQueue = (tracks: SpotifyTrack[]) => {
    if (tracks.length === 0) return;
    setQueue(prev => [...prev, ...tracks]);
    toast.success(`Added ${tracks.length} to queue`);
  };

  const clearQueue = () => {
    setQueue([]);
  };

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        progress,
        duration,
        volume,
        isLoading,
        playTrack,
        togglePlayPause,
        seekTo,
        setVolume,
        nextTrack,
        previousTrack,
        queue,
        addToQueue,
        addManyToQueue,
        clearQueue,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};