import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter, Routes, Route } from 'react-router-dom'
import Index from './pages/Index'
import AuthCallback from './pages/AuthCallback'
import NotFound from './pages/NotFound'
import Callback from './pages/Callback'
import Playlist from './pages/Playlist'
import LikedSongs from './pages/LikedSongs'
import Settings from './pages/Settings'
import Downloads from './pages/Downloads'
import Offline from './pages/Offline'
import { AuthProvider as SpotifyAuthProvider } from '@/context/SpotifyAuthContext'
import { PlayerProvider } from '@/context/PlayerContext'
import { DownloadProvider } from '@/context/DownloadContext'
import Layout from './components/Layout'
import Library from './pages/Library'

const queryClient = new QueryClient()

const App = () => (
  <QueryClientProvider client={queryClient}>
    <SpotifyAuthProvider>
      {/* FIX: Wrap PlayerProvider with DownloadProvider */}
      <DownloadProvider>
        <PlayerProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <HashRouter>
              <Routes>
                <Route path="/callback" element={<Callback />} />
                <Route path="/auth/callback" element={<AuthCallback />} />

                <Route element={<Layout />}>
                  <Route path="/" element={<Index />} />
                  <Route path="/library" element={<Library />} />
                  <Route path="/playlist/:playlistId" element={<Playlist />} />
                  <Route path="/liked-songs" element={<LikedSongs />} />
                  <Route path="/downloads" element={<Downloads />} />
                  <Route path="/offline" element={<Offline />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </HashRouter>
          </TooltipProvider>
        </PlayerProvider>
      </DownloadProvider>
    </SpotifyAuthProvider>
  </QueryClientProvider>
)

export default App
