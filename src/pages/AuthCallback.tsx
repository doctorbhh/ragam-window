import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";

const AuthCallback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // This page is likely no longer needed for the new Electron-based auth,
    // but we keep it as a placeholder to safely redirect any lingering callbacks.
    const handleCallback = async () => {
       toast({
         title: "Authentication",
         description: "Please use the 'Login with Spotify' button in the app.",
       });
       navigate("/");
    };

    handleCallback();
  }, [navigate, toast]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">
          Redirecting...
        </h2>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
      </div>
    </div>
  );
};

export default AuthCallback;
