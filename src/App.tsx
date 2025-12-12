// src/App.tsx
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout' // Import the Layout
import Library from './pages/Library' // Import the Library page
import Index from './pages/Index.tsx'
import AuthCallback from './pages/AuthCallback'
import NotFound from './pages/NotFound'
import Callback from './pages/Callback'
import Playlist from './pages/Playlist'
import LikedSongs from './pages/LikedSongs'
import Settings from './pages/Settings'
import { AuthProvider as SpotifyAuthProvider } from '@/context/SpotifyAuthContext'
import { PlayerProvider } from '@/context/PlayerContext'

const queryClient = new QueryClient()

const App = () => (
  <QueryClientProvider client={queryClient}>
    <SpotifyAuthProvider>
      <PlayerProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Auth callbacks must remain outside Layout if they don't need sidebar */}
              <Route path="/callback" element={<Callback />} />
              <Route path="/auth/callback" element={<AuthCallback />} />

              {/* Main App Routes Wrapped in Layout */}
              <Route element={<Layout />}>
                <Route path="/" element={<Index />} />
                <Route path="/library" element={<Library />} /> {/* New Route */}
                <Route path="/playlist/:playlistId" element={<Playlist />} />
                <Route path="/liked-songs" element={<LikedSongs />} />
                <Route path="/settings" element={<Settings />} />
              </Route>

              {/* 404 Route */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </PlayerProvider>
    </SpotifyAuthProvider>
  </QueryClientProvider>
)

export default App
