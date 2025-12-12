import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// CHANGED: Import HashRouter instead of BrowserRouter
import { HashRouter, Routes, Route } from 'react-router-dom'
import Index from './pages/Index'
import AuthCallback from './pages/AuthCallback'
import NotFound from './pages/NotFound'
import Callback from './pages/Callback'
import Playlist from './pages/Playlist'
import LikedSongs from './pages/LikedSongs'
import Settings from './pages/Settings'
import { AuthProvider as SpotifyAuthProvider } from '@/context/SpotifyAuthContext'
import { PlayerProvider } from '@/context/PlayerContext'
import Layout from './components/Layout' // Ensure this import exists
import Library from './pages/Library' // Ensure this import exists

const queryClient = new QueryClient()

const App = () => (
  <QueryClientProvider client={queryClient}>
    <SpotifyAuthProvider>
      <PlayerProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          {/* CHANGED: Use HashRouter for Electron compatibility */}
          <HashRouter>
            <Routes>
              {/* Public Routes */}
              <Route path="/callback" element={<Callback />} />
              <Route path="/auth/callback" element={<AuthCallback />} />

              {/* Protected/Layout Routes */}
              <Route element={<Layout />}>
                <Route path="/" element={<Index />} />
                <Route path="/library" element={<Library />} />
                <Route path="/playlist/:playlistId" element={<Playlist />} />
                <Route path="/liked-songs" element={<LikedSongs />} />
                <Route path="/settings" element={<Settings />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </HashRouter>
        </TooltipProvider>
      </PlayerProvider>
    </SpotifyAuthProvider>
  </QueryClientProvider>
)

export default App
