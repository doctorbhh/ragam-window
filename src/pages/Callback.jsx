import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const Callback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const hasRun = useRef(false); // Prevent running twice in StrictMode

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const exchangeCodeForToken = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get("code");
        const errorParam = searchParams.get("error");

        if (errorParam) {
          throw new Error(errorParam);
        }

        if (!code) {
          throw new Error("No authorization code found");
        }

        const codeVerifier = localStorage.getItem("spotify_code_verifier");
        if (!codeVerifier) {
          throw new Error("Missing code verifier");
        }

        // IMPORTANT: Must match the redirect_uri used in login exactly
        const redirectUri = `${window.location.origin.replace(
          "localhost",
          "127.0.0.1"
        )}/callback`;
        const clientId = "f3868da12ebd4a599754a9e4e927f867";

        const response = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: clientId,
            grant_type: "authorization_code",
            code: code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error_description || "Failed to exchange code");
        }

        const data = await response.json();
        const { access_token, expires_in, refresh_token } = data;

        const expiresAt = Date.now() + expires_in * 1000;

        localStorage.setItem("spotify_token", access_token);
        localStorage.setItem("spotify_expires_at", expiresAt.toString());
        if (refresh_token) {
          localStorage.setItem("spotify_refresh_token", refresh_token);
        }

        // Clean up verifier
        localStorage.removeItem("spotify_code_verifier");

        toast.success("Successfully logged in!");

        // Use window.location to ensure context reloads with new token
        window.location.href = "/";
      } catch (err) {
        console.error("Auth Error:", err);
        setError(err.message);
        toast.error(`Login failed: ${err.message}`);
        setTimeout(() => navigate("/"), 2000);
      }
    };

    exchangeCodeForToken();
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center">
        {error ? (
          <div className="text-destructive">
            <h2 className="text-xl font-bold mb-2">Login Error</h2>
            <p>{error}</p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-t-2 border-primary"></div>
            </div>
            <h2 className="text-xl font-medium">Finalizing login...</h2>
          </>
        )}
      </div>
    </div>
  );
};

export default Callback;
