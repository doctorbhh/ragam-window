import { X, Loader2, MonitorPlay } from "lucide-react";
import { useState, useEffect } from "react";

// ──────────────────────────────────────────────────────────────
// FINAL FIXED VIDEO MODAL: Uses Standard YouTube Embed (Works Like W3Schools)
// ──────────────────────────────────────────────────────────────
const VideoModal = ({
  trackName,
  artistName,
  onClose,
  videoId: hardcodedVideoId = null,
}) => {
  const [dynamicVideoId, setDynamicVideoId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [finalVideoId, setFinalVideoId] = useState(hardcodedVideoId);

  useEffect(() => {
    const searchYouTubeVideo = async () => {
      if (hardcodedVideoId) {
        setFinalVideoId(hardcodedVideoId);
        setLoading(false);
        return;
      }

      if (!trackName || !artistName) {
        setError("No track info provided");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Fallback to a more reliable Piped instance or YouTube proxy if needed
        const query = `${trackName} ${artistName} official music video`;
        const res = await fetch(
          `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(
            query
          )}&filter=videos`
        );

        if (!res.ok) throw new Error("Search failed");

        const data = await res.json();

        if (data.items?.length > 0) {
          const url = data.items[0].url;
          const id = url.split("v=")[1]?.split("&")[0];
          if (id) {
            setDynamicVideoId(id);
            setFinalVideoId(id);
          } else {
            setError("Invalid video URL");
          }
        } else {
          setError("No video found");
        }
      } catch (err) {
        console.error("YouTube search failed:", err);
        setError("Failed to find video");
      } finally {
        setLoading(false);
      }
    };

    searchYouTubeVideo();
  }, [trackName, artistName, hardcodedVideoId]);

  // FIXED: Use www.youtube.com/embed/ (exact match to W3Schools) + minimal params
  // No enablejsapi=1 (avoids JS execution errors), no autoplay (browser-safe)
  const getEmbedUrl = (id) => {
    return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&controls=1&playsinline=1&fs=1`;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-md p-4">
        <div className="relative w-full max-w-5xl bg-black rounded-2xl overflow-hidden shadow-2xl">
          <div className="relative w-full pt-[56.25%] bg-black">
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <Loader2 className="h-12 w-12 animate-spin text-red-500 mb-4" />
              <p className="text-lg">Finding video...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl bg-black rounded-2xl overflow-hidden shadow-2xl border border-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white hover:bg-red-600 transition-all backdrop-blur-sm shadow-lg"
          aria-label="Close video"
        >
          <X size={24} strokeWidth={2.5} />
        </button>

        {/* 16:9 Responsive Container */}
        <div className="relative w-full pt-[56.25%] bg-zinc-900">
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 p-8">
              <MonitorPlay size={64} className="mb-4 opacity-50" />
              <p className="text-lg text-center mb-4">{error}</p>
              <button
                onClick={onClose}
                className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition text-white"
              >
                Close
              </button>
            </div>
          ) : finalVideoId ? (
            <iframe
              key={finalVideoId} // Key helps React re-mount iframe if ID changes
              className="absolute top-0 left-0 w-full h-full rounded-lg"
              src={getEmbedUrl(finalVideoId)}
              title={`${trackName || "Music Video"} - YouTube`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              // FIXED: No sandbox (can block JS in some cases); use default security
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};
