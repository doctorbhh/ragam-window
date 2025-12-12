import React, {
  createContext,
  useState,
  useContext,
  useRef,
  useEffect,
} from "react";
import { toast } from "sonner";
import { getAudioUrlForTrack } from "@/services/youtubeService";
import { useSpotifyAuth } from "@/context/SpotifyAuthContext";
import { trackListening } from "@/services/firebaseRecommendations";

const PlayerContext = createContext();

export const usePlayer = () => useContext(PlayerContext);

export const PlayerProvider = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);
  const [originalQueue, setOriginalQueue] = useState([]);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const [isShuffled, setIsShuffled] = useState(false);
  const [repeatMode, setRepeatMode] = useState("off"); // 'off', 'all', 'one'

  const audioRef = useRef(new Audio());
  // Ref to track which songs are currently being fetched to prevent duplicate requests
  const preloadingIds = useRef(new Set());
  const { user } = useSpotifyAuth();

  // Keep originalQueue in sync when songs are added
  useEffect(() => {
    if (!isShuffled) {
      setOriginalQueue(queue);
    }
  }, [queue.length]);

  // Main Audio Event Listeners & Logic
  useEffect(() => {
    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      setProgress(audio.currentTime);

      // --- PRELOAD LOGIC ---
      // If less than 5 seconds remaining, load the next song
      if (audio.duration > 0 && audio.duration - audio.currentTime <= 5) {
        preloadNextTrack();
      }
    };

    const handleDurationChange = () => setDuration(audio.duration);
    const handleEnded = () => nextTrack();
    const handleLoadStart = () => setIsLoading(true);
    const handleCanPlay = () => setIsLoading(false);
    const handleError = (e) => {
      console.error("Audio error:", e);
      setIsLoading(false);
      setTimeout(() => nextTrack(), 2000);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadstart", handleLoadStart);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("loadstart", handleLoadStart);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("error", handleError);
    };
  }, [queue, currentTrack, repeatMode]); // Dependencies ensure closure has access to latest queue

  // --- PRELOAD FUNCTION ---
  const preloadNextTrack = async () => {
    if (queue.length === 0 || repeatMode === "one") return;

    const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id);
    let nextIndex = currentIndex + 1;

    // Handle end of queue
    if (nextIndex >= queue.length) {
      if (repeatMode === "all") {
        nextIndex = 0;
      } else {
        return; // Nothing to preload
      }
    }

    const nextTrackToLoad = queue[nextIndex];

    // Checks:
    // 1. Track exists
    // 2. We don't already have the URL
    // 3. We aren't already fetching it (prevent spamming API every 200ms)
    if (
      !nextTrackToLoad ||
      nextTrackToLoad.url ||
      preloadingIds.current.has(nextTrackToLoad.id)
    ) {
      return;
    }

    console.log(`Preloading next track: ${nextTrackToLoad.name}`);
    preloadingIds.current.add(nextTrackToLoad.id);

    try {
      // Fetch the URL in the background
      const url = await getAudioUrlForTrack(nextTrackToLoad);

      // Store it directly on the object in the queue
      // (This works because objects in state are references)
      nextTrackToLoad.url = url;
      console.log(`Preload complete for: ${nextTrackToLoad.name}`);
    } catch (error) {
      console.error(`Failed to preload ${nextTrackToLoad.name}:`, error);
    } finally {
      preloadingIds.current.delete(nextTrackToLoad.id);
    }
  };

  const trackListeningData = async (track) => {
    if (!user) return;
    try {
      await trackListening(user.id, track);
    } catch (e) {
      console.error(e);
    }
  };

  const playTrack = async (track) => {
    if (!track) return;

    if (currentTrack?.id === track.id && audioRef.current.src) {
      togglePlayPause();
      return;
    }

    audioRef.current.pause();
    setCurrentTrack(track);
    setIsLoading(true);

    try {
      let audioUrl = track.url;

      // If URL is missing, fetch it (this runs if preloading failed or didn't happen)
      if (!audioUrl) {
        try {
          audioUrl = await getAudioUrlForTrack(track);
          track.url = audioUrl;
        } catch (err) {
          if (track.preview_url) {
            audioUrl = track.preview_url;
            toast.info("Playing preview (Full audio unavailable)");
          } else {
            throw new Error("No audio source found");
          }
        }
      }

      audioRef.current.src = audioUrl;
      audioRef.current.volume = volume;

      await audioRef.current.play();
      setIsPlaying(true);
      trackListeningData(track);
    } catch (error) {
      console.error("Playback error:", error);
      toast.error(`Could not play: ${track.name}`);
      setIsLoading(false);
    }
  };

  const togglePlayPause = () => {
    if (audioRef.current.paused) {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(console.error);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const nextTrack = () => {
    if (queue.length === 0) return;

    if (repeatMode === "one" && currentTrack) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      return;
    }

    const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id);
    let nextIndex = currentIndex + 1;

    if (nextIndex >= queue.length) {
      if (repeatMode === "all") {
        nextIndex = 0;
      } else {
        setIsPlaying(false);
        return;
      }
    }

    playTrack(queue[nextIndex]);
  };

  const previousTrack = () => {
    if (queue.length === 0) return;

    if (audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }

    const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id);
    let prevIndex = currentIndex - 1;

    if (prevIndex < 0) {
      if (repeatMode === "all") prevIndex = queue.length - 1;
      else {
        playTrack(queue[0]);
        return;
      }
    }

    playTrack(queue[prevIndex]);
  };

  const seekTo = (time) => {
    if (Number.isFinite(time)) {
      audioRef.current.currentTime = time;
      setProgress(time);
    }
  };

  const addToQueue = (track) => {
    setQueue((prev) => [...prev, track]);
    if (!isShuffled) setOriginalQueue((prev) => [...prev, track]);
    toast.success("Added to queue");
  };

  const addManyToQueue = (tracks) => {
    if (!tracks?.length) return;
    setQueue((prev) => [...prev, ...tracks]);
    if (!isShuffled) setOriginalQueue((prev) => [...prev, ...tracks]);
  };

  const setPlayerVolume = (val) => {
    const newVol = Math.max(0, Math.min(1, val));
    setVolume(newVol);
    if (audioRef.current) audioRef.current.volume = newVol;
  };

  const toggleShuffle = () => {
    if (!isShuffled) {
      const shuffled = [...queue];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      if (currentTrack) {
        const currentIdx = shuffled.findIndex((t) => t.id === currentTrack.id);
        if (currentIdx > -1) {
          shuffled.splice(currentIdx, 1);
          shuffled.unshift(currentTrack);
        }
      }
      setQueue(shuffled);
      setIsShuffled(true);
      toast.info("Shuffle On");
    } else {
      if (originalQueue.length > 0) {
        setQueue(originalQueue);
      }
      setIsShuffled(false);
      toast.info("Shuffle Off");
    }
  };

  const toggleRepeat = () => {
    const modes = ["off", "all", "one"];
    const nextIndex = (modes.indexOf(repeatMode) + 1) % modes.length;
    setRepeatMode(modes[nextIndex]);
    const messages = {
      off: "Repeat Off",
      all: "Repeat Queue",
      one: "Repeat Track",
    };
    toast.info(messages[modes[nextIndex]]);
  };

  const downloadTrack = async (track) => {
    if (!track) return;
    let downloadUrl = track.url || track.preview_url;

    if (!downloadUrl) {
      try {
        toast.info("Preparing download...");
        downloadUrl = await getAudioUrlForTrack(track);
      } catch (e) {
        toast.error("Download failed");
        return;
      }
    }

    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `${track.name}.mp3`;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const clearQueue = () => {
    setQueue([]);
    setOriginalQueue([]);
  };

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        progress,
        duration,
        volume,
        queue,
        isLoading,
        isShuffled,
        repeatMode,
        playTrack,
        togglePlayPause,
        nextTrack,
        previousTrack,
        seekTo,
        setVolume: setPlayerVolume,
        addToQueue,
        addManyToQueue,
        clearQueue,
        toggleShuffle,
        toggleRepeat,
        downloadTrack,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};
